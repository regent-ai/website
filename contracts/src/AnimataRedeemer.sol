// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC721Burnable {
	function burn(uint256 tokenId) external;
}

interface IPermit2 {
	struct TokenPermissions { address token; uint256 amount; }
	struct PermitTransferFrom { TokenPermissions permitted; uint256 nonce; uint256 deadline; }
	struct SignatureTransferDetails { address to; uint256 requestedAmount; }
	function permitTransferFrom(
		PermitTransferFrom calldata permit,
		SignatureTransferDetails calldata transferDetails,
		address owner,
		bytes calldata signature
	) external;
}

contract AnimataRedeemer is IERC721Receiver, ReentrancyGuard {
	using SafeERC20 for IERC20;

	// Canonical Permit2 address
	address public constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

	// Immutable configuration
	address public immutable OWNER;
	address public immutable USDC;
	address public immutable REGENT;
	address public immutable COLL1; // Animata 1
	address public immutable COLL2; // Animata 2
	address public immutable COLL3; // Collection 3
	// Separate depositor for Collection 3 intake (can differ from OWNER)
	address public depositor;

	// Economic constants
	uint256 public constant USDC_PRICE = 80_000_000; // 80 * 1e6
	uint256 public constant MAX_ID = 999;
	uint256 public constant REGENT_PAYOUT = 5_000_000 * 1e18; // 5,000,000 REGENT (18 decimals)

	// Vesting (stacked, single rolling schedule)
	uint256 public constant VEST_DURATION = 7 days;
	struct Vest {
		uint128 pool;      // remaining to vest in current schedule
		uint128 released;  // cumulative released across schedules
		uint128 claimed;   // cumulative claimed
		uint64  start;     // current schedule start timestamp
	}
	mapping(address => Vest) private vests;

	// Timelock anchor
	uint256 public immutable deployedAt;

	event Redeemed(address indexed user, address indexed source, uint256 indexed tokenId, uint256 newId);
	event WithdrawUSDC(address indexed to, uint256 amount);
	event WithdrawREGENT(address indexed to, uint256 amount);
	event Claimed(address indexed user, uint256 amount);
	event DepositorUpdated(address indexed oldDepositor, address indexed newDepositor);

	modifier onlyOwner() {
		require(msg.sender == OWNER, "not owner");
		_;
	}

	modifier afterOneYear() {
		require(block.timestamp >= deployedAt + 365 days, "REGENT locked");
		_;
	}

	constructor(
		address owner_,
		address usdc_,
		address regent_,
		address coll1_,
		address coll2_,
		address coll3_,
		address depositor_
	) {
		require(owner_ != address(0), "owner");
		require(usdc_ != address(0) && regent_ != address(0), "tokens");
		require(coll1_ != address(0) && coll2_ != address(0) && coll3_ != address(0), "collections");
		require(depositor_ != address(0), "depositor");
		OWNER = owner_;
		USDC = usdc_;
		REGENT = regent_;
		COLL1 = coll1_;
		COLL2 = coll2_;
		COLL3 = coll3_;
		depositor = depositor_;
		deployedAt = block.timestamp;
	}

	// ---- Public user flows ----

	function redeem(address sourceCollection, uint256 tokenId) external nonReentrant {
		_redeemCommon(sourceCollection, tokenId, false);
	}

	function redeemWithPermit(
		address sourceCollection,
		uint256 tokenId,
		IPermit2.PermitTransferFrom calldata p,
		bytes calldata sig
	) external nonReentrant {
		require(p.permitted.token == USDC, "token != USDC");
		require(p.permitted.amount >= USDC_PRICE, "permit underpriced");
		require(p.deadline >= block.timestamp, "permit expired");
		IPermit2(PERMIT2).permitTransferFrom(
			p,
			IPermit2.SignatureTransferDetails({ to: address(this), requestedAmount: USDC_PRICE }),
			msg.sender,
			sig
		);
		_redeemCommon(sourceCollection, tokenId, true);
	}

	function claim() external nonReentrant {
		_updateVest(msg.sender);
		Vest storage v = vests[msg.sender];
		uint256 avail = uint256(v.released) > v.claimed ? uint256(v.released) - v.claimed : 0;
		require(avail > 0, "nothing to claim");
		v.claimed += uint128(avail);
		IERC20(REGENT).safeTransfer(msg.sender, avail);
		emit Claimed(msg.sender, avail);
	}

	function claimable(address user) external view returns (uint256) {
		Vest memory v = vests[user];
		uint256 releasedFromPool = 0;
		if (v.pool > 0) {
			uint256 elapsed = block.timestamp - v.start;
			releasedFromPool = elapsed >= VEST_DURATION
				? v.pool
				: (uint256(v.pool) * elapsed) / VEST_DURATION;
		}
		uint256 totalReleased = uint256(v.released) + releasedFromPool;
		return totalReleased > v.claimed ? totalReleased - v.claimed : 0;
	}

	// ---- Owner ops ----

	modifier onlyOwnerOrDepositor() {
		require(msg.sender == OWNER || msg.sender == depositor, "not allowed");
		_;
	}

	function setDepositor(address newDepositor) external onlyOwner {
		require(newDepositor != address(0), "depositor");
		address old = depositor;
		depositor = newDepositor;
		emit DepositorUpdated(old, newDepositor);
	}

	function depositCollection3(uint256[] calldata ids) external onlyOwnerOrDepositor {
		IERC721 c3 = IERC721(COLL3);
		for (uint256 i = 0; i < ids.length; ) {
			c3.safeTransferFrom(msg.sender, address(this), ids[i]);
			unchecked { ++i; }
		}
	}

	function withdrawUSDC(address to, uint256 amount) external onlyOwner nonReentrant {
		require(to != address(0), "to");
		IERC20(USDC).safeTransfer(to, amount);
		emit WithdrawUSDC(to, amount);
	}

	function withdrawREGENT(address to, uint256 amount) external onlyOwner nonReentrant afterOneYear {
		require(to != address(0), "to");
		IERC20(REGENT).safeTransfer(to, amount);
		emit WithdrawREGENT(to, amount);
	}

	function emergencyWithdrawAllREGENT(address to) external onlyOwner nonReentrant {
		require(block.timestamp <= deployedAt + 1 days, "window passed");
		require(to != address(0), "to");
		uint256 bal = IERC20(REGENT).balanceOf(address(this));
		IERC20(REGENT).safeTransfer(to, bal);
		emit WithdrawREGENT(to, bal);
	}

	function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
		require(token != USDC && token != REGENT, "restricted");
		IERC20(token).safeTransfer(to, amount);
	}

	// ---- Views / helpers ----

	function price() public pure returns (uint256) { return USDC_PRICE; }

	function mapToCollection3(address source, uint256 tokenId) public view returns (uint256) {
		require(source == COLL1 || source == COLL2, "invalid collection");
		require(tokenId >= 1 && tokenId <= MAX_ID, "id");
		return source == COLL1 ? tokenId : tokenId + MAX_ID;
	}

	function getVest(address user)
		external
		view
		returns (uint128 pool, uint128 released, uint128 claimed, uint64 start)
	{
		Vest memory v = vests[user];
		return (v.pool, v.released, v.claimed, v.start);
	}

	// ---- Internals ----

	function _redeemCommon(
		address sourceCollection,
		uint256 tokenId,
		bool usdcAlreadyPulled
	) internal {
		require(sourceCollection == COLL1 || sourceCollection == COLL2, "invalid collection");
		require(tokenId >= 1 && tokenId <= MAX_ID, "id");

		uint256 newId = sourceCollection == COLL1 ? tokenId : tokenId + MAX_ID;
		// Ensure the mapped Collection 3 token exists and is custody-held here
		try IERC721(COLL3).ownerOf(newId) returns (address owner) {
			require(owner == address(this), "C3 unavailable");
		} catch {
			revert("C3 unavailable");
		}
		require(IERC20(REGENT).balanceOf(address(this)) >= REGENT_PAYOUT, "no REGENT");

		// Collect payment first (best practice; atomicity guarantees no partial progress)
		if (!usdcAlreadyPulled) {
			IERC20(USDC).safeTransferFrom(msg.sender, address(this), USDC_PRICE);
		}

		// Then take and burn the source NFT
		IERC721(sourceCollection).transferFrom(msg.sender, address(this), tokenId);
		IERC721Burnable(sourceCollection).burn(tokenId);

		// Stack vest schedule and restart
		_updateVest(msg.sender);
		Vest storage v = vests[msg.sender];
		v.pool += uint128(REGENT_PAYOUT);
		v.start = uint64(block.timestamp);

		// Send mapped Collection 3 NFT last
		IERC721(COLL3).safeTransferFrom(address(this), msg.sender, newId);

		emit Redeemed(msg.sender, sourceCollection, tokenId, newId);
	}

	function _updateVest(address user) internal {
		Vest storage v = vests[user];
		if (v.pool == 0) { v.start = uint64(block.timestamp); return; }
		uint256 elapsed = block.timestamp - v.start;
		if (elapsed == 0) return;
		uint256 newly = elapsed >= VEST_DURATION ? v.pool : (uint256(v.pool) * elapsed) / VEST_DURATION;
		v.released += uint128(newly);
		v.pool     -= uint128(newly);
		v.start     = uint64(block.timestamp);
	}

	// ---- ERC721 Receiver & ETH ----

	function onERC721Received(
		address /*operator*/,
		address /*from*/,
		uint256 /*id*/,
		bytes calldata /*data*/
	) external override returns (bytes4) {
		require(msg.sender == COLL3, "only C3 deposits");
		return IERC721Receiver.onERC721Received.selector;
	}

	receive() external payable { revert("no ETH"); }
	fallback() external payable { revert("no ETH"); }
}



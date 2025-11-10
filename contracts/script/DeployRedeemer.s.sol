// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IERC721 {
    function setApprovalForAll(address operator, bool approved) external;
}

interface IAnimataRedeemer {
    struct TokenPermissions { address token; uint256 amount; }
    struct PermitTransferFrom { TokenPermissions permitted; uint256 nonce; uint256 deadline; }
    function redeemWithPermit(address sourceCollection, uint256 tokenId, PermitTransferFrom calldata p, bytes calldata sig) external;
}

library Permit2Sig {
    // Base mainnet (8453); use 84532 for Base Sepolia
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 internal constant NAME_HASH = keccak256("Permit2");
    bytes32 internal constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 internal constant PERMIT_TRANSFER_FROM_TYPEHASH =
        keccak256("PermitTransferFrom(TokenPermissions permitted,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)");

    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function domainSeparator(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, chainId, PERMIT2));
    }

    function hashPerm(IAnimataRedeemer.TokenPermissions memory p) internal pure returns (bytes32) {
        return keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, p.token, p.amount));
    }

    function hashPermit(IAnimataRedeemer.PermitTransferFrom memory p) internal pure returns (bytes32) {
        return keccak256(abi.encode(PERMIT_TRANSFER_FROM_TYPEHASH, hashPerm(p.permitted), p.nonce, p.deadline));
    }

    function digest(uint256 chainId, IAnimataRedeemer.PermitTransferFrom memory p) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(chainId), hashPermit(p)));
    }
}

contract RedeemWithPermitScript is Script {
    // Base mainnet USDC + Animata collections
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant ANIMATA1 = 0x78402119Ec6349A0D41F12b54938De7BF783C923;
    address constant ANIMATA2 = 0x903C4c1E8B8532FbD3575482d942D493eb9266e2;
    uint256 constant USDC_PRICE = 80e6; // 80 USDC (6 decimals)

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");                 // EOA that holds USDC and the Animata NFT
        address REDEEMER = vm.envAddress("REDEEMER_ADDRESS");   // deployed AnimataRedeemer
        uint256 TOKEN_ID = vm.envUint("TOKEN_ID");              // 1..999
        // choose source via env; defaults to ANIMATA2
        address SOURCE = vm.envOr("SOURCE_COLLECTION", ANIMATA2);
        uint256 CHAIN_ID = vm.envOr("CHAIN_ID", uint256(8453)); // 8453 mainnet, 84532 Base Sepolia

        address owner = vm.addr(pk);
        console2.log("Owner:", owner);

        // 1) Approve Redeemer for NFT (only if not already approved)
        vm.startBroadcast(pk);
        IERC721(SOURCE).setApprovalForAll(REDEEMER, true);
        vm.stopBroadcast();

        // 2) Build Permit2 typed message and sign with owner key
        IAnimataRedeemer.PermitTransferFrom memory p = IAnimataRedeemer.PermitTransferFrom({
            permitted: IAnimataRedeemer.TokenPermissions({ token: USDC, amount: USDC_PRICE }),
            nonce: uint256(keccak256(abi.encodePacked(owner, block.timestamp, block.prevrandao))), // unique
            deadline: block.timestamp + 15 minutes
        });

        bytes32 dig = Permit2Sig.digest(CHAIN_ID, p);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, dig);
        bytes memory sig = abi.encodePacked(r, s, v);

        // sanity: recovered signer must match owner
        address rec = ecrecover(dig, v, r, s);
        require(rec == owner, "bad signature");

        // 3) Call redeemWithPermit
        vm.startBroadcast(pk);
        IAnimataRedeemer(REDEEMER).redeemWithPermit(SOURCE, TOKEN_ID, p, sig);
        vm.stopBroadcast();
    }
}
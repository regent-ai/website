"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Cell {
  grade: number;
  opacity: number;
  hue: number;
  spinSpeed: number;
}

export function GridHero() {
  const gridRef = useRef<HTMLDivElement>(null);
  const [showMessage, setShowMessage] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hideHintText, setHideHintText] = useState(false);
  const [specialCellIndex, setSpecialCellIndex] = useState<number | null>(null);
  const [specialCellClicked, setSpecialCellClicked] = useState(false);
  const [showTimelineCard, setShowTimelineCard] = useState(false);
  const [isTimelineHovered, setIsTimelineHovered] = useState(false);
  const [showSocialCard, setShowSocialCard] = useState(false);
  const [showLogoCard, setShowLogoCard] = useState(false);
  const [isLogoAnimationActive, setIsLogoAnimationActive] = useState(false);
  const [showAnimataCard, setShowAnimataCard] = useState(false);
  const [hideHintAfterDelay, setHideHintAfterDelay] = useState(false);
  const [logoAnimationCompleted, setLogoAnimationCompleted] = useState(false);
  const [cols, setCols] = useState(0);
  const [rows, setRows] = useState(0);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const calculateGridSize = () => {
      const idealCellSize = 17.5; // Smaller cells to fit more on screen (30% reduction)
      const cols = Math.floor(window.innerWidth / idealCellSize);
      const rows = Math.floor(window.innerHeight / idealCellSize);
      return { cols, rows };
    };

    const buildGrid = () => {
      const gridSize = calculateGridSize();
      const gridCols = gridSize.cols;
      const gridRows = gridSize.rows;
      setCols(gridCols);
      setRows(gridRows);
      
      const cells: (Cell | null)[] = [];
      
      // Reserve top rows empty for widget overlay (hide one more row)
      const emptyTopRows = 5;
      // (legacy) empty area for title (upper left)
      const emptyCols = 5;
      const emptyRows = 2;
      
      for (let i = 0; i < gridCols * gridRows; i++) {
        const row = Math.floor(i / gridCols);
        const col = i % gridCols;
        
        // Skip entire top rows
        if (row < emptyTopRows) {
          cells.push(null);
          continue;
        }
        
        // Skip cells in the empty area (upper left)
        if (row < emptyRows && col < emptyCols) {
          cells.push(null); // Push null to maintain grid structure
          continue;
        }
        
        // Randomly assign spin speed: 10% get 0, 30% get 2x, 60% get 1x
        const rand = Math.random();
        let spinSpeed = 1.0;
        let grade = Math.floor(Math.random() * 12 - 6);
        
        if (rand < 0.1) {
          spinSpeed = 0; // 10% don't spin
          grade = 0; // No rotation for no-spin cells
        } else if (rand < 0.4) {
          spinSpeed = 2.0; // 30% spin 2x faster
        }
        
        cells.push({
          grade: grade,
          opacity: Math.min(Math.random(), 0.2),
          hue: Math.floor(Math.random() * 30),
          spinSpeed: spinSpeed,
        });
      }

      grid.innerHTML = cells
        .map(
          (cell) => cell === null ? '<div></div>' : `
      <div style="
        --grade: ${cell.grade};
        --opacity: ${cell.opacity};
        --hue: ${cell.hue};
        transition-duration: 2.4s, ${cell.spinSpeed === 0 ? '0s' : cell.spinSpeed === 2 ? '1.2s' : '2.4s'}, 0.6s;
        font-family: var(--font-neue-bit);
        font-size: 5rem;
      ">+</div>
    `
        )
        .join("");
      
      grid.style.setProperty("--cols", String(gridCols));
      grid.style.setProperty("--rows", String(gridRows));

      // Shift the grid down so it visually starts after the empty top rows
      const cellHeight = window.innerHeight / gridRows;
      const reservedHeight = Math.round(cellHeight * emptyTopRows);
      grid.style.marginTop = `${reservedHeight}px`;
      grid.style.height = `calc(100% - ${reservedHeight}px)`;
    };

    buildGrid();
    
    // Capture grid dimensions for the timer
    const currentGridSize = calculateGridSize();

    let hintTimer: NodeJS.Timeout;
    
    // Show message after 4 seconds
    const messageTimer = setTimeout(() => {
      setShowMessage(true);
      
      // Show hint after 2 more seconds
      hintTimer = setTimeout(() => {
        setShowHint(true);
        
        // Pick a random cell from first 3 columns and rows 3-5
        const randomRow = Math.floor(Math.random() * 3) + 3; // 3, 4, or 5
        const randomCol = Math.floor(Math.random() * 3); // 0, 1, or 2
        const randomIndex = randomRow * currentGridSize.cols + randomCol;
        setSpecialCellIndex(randomIndex);
      }, 2000);
    }, 4000);

    const handleResize = () => {
      buildGrid();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(messageTimer);
      if (hintTimer) clearTimeout(hintTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Hide cells in center area when message appears
  useEffect(() => {
    if (!showMessage || !gridRef.current || cols === 0 || rows === 0) return;

    const grid = gridRef.current;
    const cells = grid.querySelectorAll('div');
    
    // Define center area to hide (roughly 8x4 cells in the middle)
    const centerCols = 8;
    const centerRows = 4;
    const startCol = Math.floor((cols - centerCols) / 2);
    const startRow = Math.floor((rows - centerRows) / 2);
    
    cells.forEach((cell, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      
      // Hide cells in the center area
      if (row >= startRow && row < startRow + centerRows && 
          col >= startCol && col < startCol + centerCols) {
        cell.style.opacity = '0';
        cell.style.pointerEvents = 'none';
      }
    });
  }, [showMessage, cols, rows]);

  // Highlight special cell and make it clickable
  useEffect(() => {
    if (!showHint || specialCellIndex === null || !gridRef.current) return;

    const grid = gridRef.current;
    const cells = grid.querySelectorAll('div');
    const specialCell = cells[specialCellIndex];
    
    if (specialCell) {
      let handleClick: (() => void) | null = null;
      
      // Wait 0.5 seconds before turning green
      const highlightTimer = setTimeout(() => {
        // Add the special-cell class for animation
        specialCell.classList.add('special-cell');
        specialCell.style.cursor = 'pointer';
        specialCell.style.transition = 'opacity 1s ease-in, filter 1s ease-in';
        specialCell.style.opacity = '1';
        specialCell.style.filter = 'none'; // Remove grayscale filter
        
        // Add click handler
        handleClick = () => {
          console.log('Special cell clicked!');
          setHideHintText(true);
          setSpecialCellClicked(true);
        };
        
        specialCell.addEventListener('click', handleClick);
      }, 500);
      
      return () => {
        clearTimeout(highlightTimer);
        if (specialCell && handleClick) {
          specialCell.classList.remove('special-cell');
          specialCell.removeEventListener('click', handleClick);
        }
      };
    }
  }, [showHint, specialCellIndex]);

  // Handle click animation sequence
  useEffect(() => {
    if (!specialCellClicked || !gridRef.current || specialCellIndex === null) return;

    const grid = gridRef.current;
    const cells = grid.querySelectorAll('div');
    const specialCell = cells[specialCellIndex];
    
    if (specialCell) {
      // Stop spinning and keep green
      specialCell.style.animation = 'pulseGreen 1s ease-in-out infinite';
      specialCell.style.color = '#39ff14';
      
      // Immediately fade cells in columns 1-5, rows 2-6
      const fadeDuration = 200; // 0.2 seconds per row (faster)
      const columnsToFade = [0, 1, 2, 3, 4]; // First 5 columns (columns 1-5)
      const rowsToFade = [2, 3, 4, 5, 6]; // Rows 2-6 (0-indexed)
      
      rowsToFade.forEach((row, rowIndex) => {
        setTimeout(() => {
          columnsToFade.forEach(col => {
            const cellIndex = row * cols + col;
            const cell = cells[cellIndex];
            if (cell) {
              cell.style.transition = 'opacity 0.3s ease-out';
              cell.style.opacity = '0';
              cell.style.pointerEvents = 'none';
            }
          });
        }, rowIndex * fadeDuration);
      });
      
      // Show timeline card after fade completes
      const totalFadeTime = rowsToFade.length * fadeDuration;
      setTimeout(() => {
        setShowTimelineCard(true);
      }, totalFadeTime);
    }
  }, [specialCellClicked, specialCellIndex, cols]);

  // Handle delayed hide of social card
  useEffect(() => {
    if (isTimelineHovered) {
      setShowSocialCard(true);
    } else {
      const timer = setTimeout(() => {
        setShowSocialCard(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isTimelineHovered]);

  // Show logo card after 1 second of hovering social card
  useEffect(() => {
    if (showSocialCard) {
      const timer = setTimeout(() => {
        setShowLogoCard(true);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setShowLogoCard(false);
    }
  }, [showSocialCard]);

  // Handle logo click animation - change colors to green
  useEffect(() => {
    if (!isLogoAnimationActive || !gridRef.current || cols === 0 || rows === 0) return;

    const grid = gridRef.current;
    const cells = grid.querySelectorAll('div');
    
    // Change all + icons to green colors
    cells.forEach((cell, i) => {
      if (cell.textContent && cell.textContent.trim() === '+') {
        const col = i % cols;
        const row = Math.floor(i / cols);
        
        // Skip cells in the upper left section if they're already hidden
        if (row >= 2 && row <= 6 && col <= 4 && cell.style.opacity === '0') {
          return;
        }
        
        // Calculate delay for left-to-right progression
        const delay = (col / cols) * 1000; // Spread over 1 second
        
        setTimeout(() => {
          // Change hue to green shades (100-140 for green range)
          const greenHue = Math.floor(Math.random() * 40) + 100; // 100-140 for various greens
          cell.style.setProperty('--hue', String(greenHue));
        }, delay);
      }
    });
    
    // Mark animation as completed
    setTimeout(() => {
      setLogoAnimationCompleted(true);
    }, 1500);
  }, [isLogoAnimationActive, cols, rows]);

  // Hide hint text after 1.5 seconds
  useEffect(() => {
    if (showHint) {
      const timer = setTimeout(() => {
        setHideHintAfterDelay(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [showHint]);

  return (
    <main style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden" }}>
      <div ref={gridRef} className="hero-grid"></div>
      
      {/* Regent title in upper left */}
      <div style={{
        position: "absolute",
        top: "20px",
        left: "20px",
        zIndex: 20,
        color: "white",
        fontSize: "4rem",
        fontWeight: 600,
        fontFamily: "var(--font-mondwest)",
        lineHeight: 1.4,
      }}>
        <div>Regent</div>
        <div style={{ fontSize: "1.6rem", opacity: 0.8 }}>
          agent x402 revenue,<br />tokenized
        </div>
      </div>
      
      {/* Center-top call-to-action removed */}
      
      {/* Middle text removed per design */}
      
      {/* Timeline card */}
      {showTimelineCard && (
        <div 
          style={{
            position: "absolute",
            top: "215px",
            left: "40px",
            zIndex: 30,
          }}
          onMouseEnter={() => setIsTimelineHovered(true)}
          onMouseLeave={() => setIsTimelineHovered(false)}
        >
          <div style={{
            color: "white",
            fontSize: "1.3rem",
            fontWeight: 500,
            fontFamily: "var(--font-mondwest)",
            padding: "24px",
            background: "rgba(0, 0, 0, 0.95)",
            borderRadius: "12px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
            opacity: showTimelineCard ? 1 : 0.2,
            transform: showTimelineCard ? "translateY(0)" : "translateY(80vh)",
            transition: "opacity 2s ease-out, transform 2s cubic-bezier(0.16, 1, 0.3, 1)",
            maxWidth: "352px",
            animation: showTimelineCard ? "fadeInTimeline 2s ease-out" : "none",
          }}>
            <div style={{ fontSize: "1.7rem", fontWeight: 700, marginBottom: "16px" }}>
              Timeline
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ position: "relative" }}>
                <span 
                  className={isLogoAnimationActive ? "glitch-text-green" : "glitch-text"}
                  onMouseEnter={() => setShowAnimataCard(true)}
                  onMouseLeave={() => setShowAnimataCard(false)}
                  onClick={() => setShowAnimataCard(!showAnimataCard)}
                  style={{ cursor: "pointer" }}
                >
                  Animata
                </span> 10/30 4:02pm UTC
                
                {/* Animata card */}
                {showAnimataCard && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    left: "0",
                    marginTop: "4px",
                    padding: "9px 13px",
                    background: "rgba(0, 0, 0, 0.98)",
                    borderRadius: "6px",
                    border: "2px solid rgba(255, 255, 255, 0.3)",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)",
                    fontSize: "0.88rem",
                    zIndex: 100,
                    opacity: showAnimataCard ? 1 : 0,
                    transition: "opacity 0.2s ease-out",
                    maxWidth: "330px",
                    lineHeight: "1.4",
                    backdropFilter: "blur(10px)",
                  }}>
                    Supporter early mint for .02eth<br />
                    Equal $REGENT airdrop after launch
                  </div>
                )}
              </div>
              <div>$REGENT clank base launch 11/6</div>
              <div>8004x402 Agent Rev Tokens: DevConnect</div>
            </div>
          </div>
          
          {/* Social links card */}
          <div 
            className="social-links-card"
            style={{
              position: "absolute",
              top: "100%",
              left: "0",
              marginTop: "8px",
              padding: "12px 16px",
              background: "rgba(0, 0, 0, 0.95)",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
              opacity: showSocialCard ? 1 : 0,
              transform: showSocialCard ? "translateY(0)" : "translateY(-20px)",
              transition: "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              pointerEvents: showSocialCard ? "auto" : "none",
              display: "flex",
              gap: "16px",
              alignItems: "center",
            }}
          >
            <a 
              href="https://x.com/regent_cx" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: "white", fontSize: "1.5rem", textDecoration: "none", display: "inline-block", transform: "translateY(2px)" }}
            >
              𝕏
            </a>
            <a 
              href="https://farcaster.xyz/regent" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: "white", fontSize: "3rem", textDecoration: "none", display: "flex", alignItems: "center" }}
            >
              <img src="/black-whitefarcaster.svg" alt="Farcaster" style={{ width: "24px", height: "24px" }} />
            </a>
            <a 
              href="https://t.me/+pJHTcXBj3yxmZmEx" 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={() => setShowLogoCard(true)}
              style={{ color: "white", fontSize: "3rem", textDecoration: "none" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
              </svg>
            </a>
            <a 
              href="https://github.com/regent-ai/web" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: "white", fontSize: "3rem", textDecoration: "none" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
          </div>
          
          
          
          
          {/* Logo card */}
          {showLogoCard && (
            <div 
              style={{
                position: "absolute",
                top: "100%",
                left: "175px",
                marginTop: "8px",
                padding: "30px",
                background: "rgba(0, 0, 0, 0.95)",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                opacity: showLogoCard ? 1 : 0,
                transform: showLogoCard ? "translateY(0)" : "translateY(-20px)",
                transition: "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "112.5px",
                width: "112.5px",
                overflow: "hidden",
              }}
            >
              <img 
                src="/regentlogo.svg" 
                alt="Regent Logo" 
                onClick={() => {
                  if (logoAnimationCompleted) {
                    window.open('https://x.com/regent_cx', '_blank', 'noopener,noreferrer');
                  } else {
                    setIsLogoAnimationActive(true);
                  }
                }}
                style={{ 
                  width: "100%", 
                  height: "100%", 
                  filter: "invert(1)",
                  objectFit: "contain",
                  transform: "scale(2.2)",
                  cursor: "pointer"
                }} 
              />
            </div>
          )}
        </div>
      )}
    </main>
  );
}

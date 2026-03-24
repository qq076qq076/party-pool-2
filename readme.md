本專案採用 React + PixiJS 的現代化網頁遊戲架構，結合了 React 的強大狀態管理與 PixiJS 的極致渲染效能。

核心開發環境 (Development Environment)
React (v18+):

職責：負責遊戲整體的生命週期管理、組件化開發以及複雜的 UI 系統。

Vite + TypeScript:

職責：提供極速的開發熱更新（HMR）與強型別支持，確保大規模遊戲邏輯的可維護性。

渲染與遊戲核心 (Rendering & Core)
PixiJS (v8+):

定位：底層 WebGL/WebGPU 渲染核心。

@pixi/react:

職責：將 PixiJS 封裝為 React 組件，允許使用 JSX 語法（如 <Stage>, <Sprite>, <Container>）來構建遊戲場景。

物理與功能模組 (Physics & Utility)
Matter.js:

職責：處理 2D 物理碰撞、重力與剛體模擬，透過 React 的 useTick 鉤子與渲染層同步。

Zustand:

職責：輕量化狀態管理，負責跨組件的遊戲數據（如分數、關卡狀態、玩家屬性）同步。
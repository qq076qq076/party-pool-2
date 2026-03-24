# Party Pool 2

多人派對網頁遊戲（主畫面 + 手機控制器），依 `規格書.md` 與 `遊戲機制.md` 實作 MVP。

## 技術堆疊

- 前端：React + Vite + TypeScript
- 遊戲渲染：PixiJS + `@pixi/react`
- 物理：Matter.js
- 狀態管理：Zustand
- 即時通訊：WebSocket (`ws`)
- 共用型別：`packages/shared`

## 開發模式（TDD，強制）

本專案採 **測試先行（Test-Driven Development）**：

1. `Red`：先寫測試，且測試必須先失敗。
2. `Green`：只寫最小實作讓測試通過。
3. `Refactor`：在測試保護下重構與清理。

### TDD 規則

- 任何新功能都要先有測試，再寫實作。
- Bug 修復必須先補「可重現該 bug 的測試」。
- PR/提交前至少要跑過本地測試與型別檢查。

## 專案結構

```text
.
├─ apps/
│  ├─ web/        # 主畫面 + 手機控制器前端
│  └─ server/     # WebSocket 即時伺服器
├─ packages/
│  └─ shared/     # 前後端共用事件型別與常數
├─ 規格書.md
└─ 遊戲機制.md
```

## 開發指令

```bash
npm install
npm run dev        # 同時啟動 web + server
npm run dev:web
npm run dev:server
```

驗證指令（已可用）：

```bash
npm run test
npm run check
npm run build
```

預設服務位址：

- Web: `http://localhost:5173`
- WebSocket Server: `ws://localhost:8787`
- 前端可透過 `VITE_WS_URL` 覆寫 WS 位址

## Task 階段規劃（MVP）

1. Phase 1：房間核心（建立/加入/重連/等待室同步）
2. Phase 2：準備流程（OK 機制、60 秒倒數、自動開局）
3. Phase 3：第一關 Tap Challenge（輸入、計分、單回合結果）
4. Phase 4：三回合整局結算（同分並列、再來一局）
5. Phase 5：UI/語系/權限與穩定性（中英切換、DeviceMotion 條件授權）

目前進度：Phase 1 已啟動並完成第一輪可運行版本（開房/加入/準備倒數/自動開局）。

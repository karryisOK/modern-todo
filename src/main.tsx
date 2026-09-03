import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// 平台标记：macOS(WKWebView) 上使用原生悬浮滚动条样式（见 global.css）
if (/(Mac|iPhone|iPad)/i.test(navigator.userAgent)) {
  document.documentElement.dataset.platform = "macos";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BoardApp } from "./ui/board/BoardApp";
import { HostApp } from "./ui/host/HostApp";
import "./ui/theme.css";

// One page, two windows: the host console (default) and the audience board (#/board).
const isBoard = window.location.hash === "#/board";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isBoard ? <BoardApp /> : <HostApp />}</StrictMode>,
);

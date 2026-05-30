import { state, setUsername } from "./state.js";
import { $, toast, openModal, closeModal } from "./ui.js";
import { refreshLobbies, startAutoRefresh } from "./browser.js";
import { createLobby, joinByCode, leaveLobby, copyLobbyCode, sendChat, startGame } from "./lobby.js";

// --- Init ---
$("usernameInput").value = state.username;

$("saveUserBtn").addEventListener("click", () => {
  const name = $("usernameInput").value.trim();
  if (!name) { toast("Username can't be empty", "error"); return; }
  setUsername(name);
  toast("Username saved", "success");
});

// --- Browser controls ---
$("refreshBtn").addEventListener("click", refreshLobbies);
$("createBtn").addEventListener("click", () => openModal("createModal"));
$("joinPrivateBtn").addEventListener("click", () => openModal("joinModal"));

// --- Modal close buttons ---
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

// --- Visibility radios ---
document.querySelectorAll('input[name="visibility"]').forEach(r => {
  r.addEventListener("change", () => {
    const isPrivate = document.querySelector('input[name="visibility"]:checked').value === "private";
    $("passwordField").style.display = isPrivate ? "" : "none";
  });
});

// --- Create lobby ---
$("confirmCreateBtn").addEventListener("click", async () => {
  const name = $("newLobbyName").value.trim();
  if (!name) { toast("Lobby name required", "error"); return; }
  const maxPlayers = parseInt($("newLobbyMaxPlayers").value, 10);
  const visibility = document.querySelector('input[name="visibility"]:checked').value;
  const password = visibility === "private" ? $("newLobbyPassword").value : "";

  closeModal("createModal");
  await createLobby({
    name,
    maxPlayers,
    visibility,
    password,
    hostId: state.userId,
    hostName: state.username,
  });
});

// --- Join by code ---
$("confirmJoinBtn").addEventListener("click", async () => {
  const code = $("joinCodeInput").value.trim().toUpperCase();
  const pwd = $("joinPasswordInput").value;
  if (!code) { toast("Code required", "error"); return; }
  closeModal("joinModal");
  await joinByCode(code, pwd);
});

// --- In-lobby controls ---
$("leaveLobbyBtn").addEventListener("click", leaveLobby);
$("copyCodeBtn").addEventListener("click", copyLobbyCode);
$("startGameBtn").addEventListener("click", startGame);

$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("chatInput");
  const text = input.value.trim();
  if (!text) return;
  sendChat(text);
  input.value = "";
});

// --- Initial load ---
refreshLobbies();
startAutoRefresh();

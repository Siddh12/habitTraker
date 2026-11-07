const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dailyTrack", {
  getSession: () => ipcRenderer.invoke("auth:get-session"),
  requestOtp: (email) => ipcRenderer.invoke("auth:request-otp", email),
  verifyOtp: (email, code) => ipcRenderer.invoke("auth:verify-otp", { email, code }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getState: () => ipcRenderer.invoke("state:get"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
  openFullApp: () => ipcRenderer.invoke("window:open-full"),
  resizePanel: (size) => ipcRenderer.invoke("window:resize-panel", size),
  hideFullApp: () => ipcRenderer.invoke("window:hide-full"),
  closePanel: () => ipcRenderer.invoke("window:close-panel"),
  minimizePanel: () => ipcRenderer.invoke("window:minimize-panel"),
  onStateUpdated: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("state:updated", handler);
    return () => ipcRenderer.removeListener("state:updated", handler);
  },
  onSessionUpdated: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("session:updated", handler);
    return () => ipcRenderer.removeListener("session:updated", handler);
  },
});

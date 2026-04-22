import React, { useEffect } from 'react';
import { IoTerminal, IoSettings } from 'react-icons/io5';
import './MenuOverlay.css';

function MenuOverlay({ isOpen, onClose, onOpenConsole, onOpenSettings, buttonRect }) {
  useEffect(() => {
    if (isOpen && window.electronAPI) {
      // Ocultar el BrowserView cuando el menú está abierto
      window.electronAPI.hideBrowserView();
    } else if (!isOpen && window.electronAPI) {
      // Mostrar el BrowserView cuando el menú se cierra
      window.electronAPI.showBrowserView();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleMenuClick = (action) => {
    onClose();
    action();
  };

  // Calcular posición del menú basado en la posición del botón
  const menuStyle = buttonRect ? {
    position: 'fixed',
    top: buttonRect.bottom + 8,
    right: window.innerWidth - buttonRect.right,
    zIndex: 10000
  } : {};

  return (
    <div className="menu-overlay" onClick={onClose}>
      <div 
        className="menu-overlay-content" 
        style={menuStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          className="menu-overlay-item"
          onClick={() => handleMenuClick(onOpenConsole)}
        >
          <IoTerminal />
          <span>Consola de Desarrollador</span>
        </button>
        <div className="menu-overlay-divider"></div>
        <button 
          className="menu-overlay-item"
          onClick={() => handleMenuClick(onOpenSettings)}
        >
          <IoSettings />
          <span>Configuración</span>
        </button>
      </div>
    </div>
  );
}

export default MenuOverlay;
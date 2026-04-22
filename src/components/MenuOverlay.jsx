import React, { useEffect, useRef } from 'react';
import { IoTerminal, IoSettings } from 'react-icons/io5';
import './MenuOverlay.css';

function MenuOverlay({ isOpen, onClose, onOpenConsole, onOpenSettings, buttonRect }) {
  const prevOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isOpen;

    if (isOpen && window.electronAPI) {
      window.electronAPI.hideBrowserView();
    } else if (!isOpen && wasOpen && window.electronAPI) {
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
import React, { useState, useEffect, useRef } from 'react';
import { 
  IoArrowBack, 
  IoArrowForward, 
  IoReload, 
  IoStar, 
  IoStarOutline,
  IoBookmarks, 
  IoTime,
  IoEllipsisVertical,
  IoLockClosed
} from 'react-icons/io5';
import './NavigationBar.css';

function NavigationBar({ 
  currentUrl, 
  loading,
  onNavigate, 
  onBack, 
  onForward, 
  onReload,
  onBookmark,
  onToggleBookmarks,
  onToggleHistory,
  onOpenSettings,
  onOpenConsole,
  onMenuToggle
}) {
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    setUrlInput(currentUrl);
  }, [currentUrl]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onNavigate(urlInput);
  };

  const toggleMenu = () => {
    const newMenuState = !menuOpen;
    setMenuOpen(newMenuState);
    
    if (onMenuToggle && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      onMenuToggle(newMenuState, rect, onOpenConsole, onOpenSettings);
    }
  };

  const isSecure = currentUrl.startsWith('https://');

  return (
    <div className="navigation-bar">
      <button className="nav-button" onClick={onBack} title="Atrás">
        <IoArrowBack />
      </button>
      <button className="nav-button" onClick={onForward} title="Adelante">
        <IoArrowForward />
      </button>
      <button className="nav-button" onClick={onReload} title="Recargar">
        <IoReload className={loading ? 'spinning' : ''} />
      </button>
      
      <form onSubmit={handleSubmit} className="url-bar-container">
        {isSecure && <IoLockClosed className="lock-icon" />}
        <input
          type="text"
          className="url-bar"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Buscar o ingresar URL"
        />
      </form>

      <button className="nav-button" onClick={onBookmark} title="Agregar marcador">
        <IoStarOutline />
      </button>
      <button className="nav-button" onClick={onToggleBookmarks} title="Marcadores">
        <IoBookmarks />
      </button>
      <button className="nav-button" onClick={onToggleHistory} title="Historial">
        <IoTime />
      </button>
      
      <button 
        ref={menuButtonRef}
        className={`menu-button ${menuOpen ? 'active' : ''}`}
        onClick={toggleMenu}
        title="Menú"
      >
        <IoEllipsisVertical />
      </button>
    </div>
  );
}

export default NavigationBar;

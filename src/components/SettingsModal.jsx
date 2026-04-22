import React, { useState, useEffect } from 'react';
import { IoClose, IoTrash, IoInformationCircle } from 'react-icons/io5';
import './SettingsModal.css';

function SettingsModal({ onClose }) {
  const [cacheSize, setCacheSize] = useState(0);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadCacheSize();
  }, []);

  const loadCacheSize = async () => {
    if (window.electronAPI) {
      const size = await window.electronAPI.getCacheSize();
      setCacheSize(size);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleClearCache = async () => {
    if (window.electronAPI) {
      setClearing(true);
      await window.electronAPI.clearCache();
      await loadCacheSize();
      setClearing(false);
      alert('Cache limpiado exitosamente');
    }
  };

  const handleClearCookies = async () => {
    if (window.electronAPI) {
      setClearing(true);
      await window.electronAPI.clearCookies();
      setClearing(false);
      alert('Cookies eliminadas exitosamente. Puede que necesites volver a iniciar sesión en los sitios web.');
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('¿Estás seguro de que quieres eliminar todos los datos de navegación? Esto incluye cookies, cache, y cerrarás sesión en todos los sitios.')) {
      if (window.electronAPI) {
        setClearing(true);
        await window.electronAPI.clearCache();
        await window.electronAPI.clearCookies();
        await loadCacheSize();
        setClearing(false);
        alert('Todos los datos han sido eliminados');
      }
    }
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Configuración</h2>
          <button className="close-settings" onClick={onClose}>
            <IoClose />
          </button>
        </div>

        <div className="settings-content">
          <section className="settings-section">
            <h3>Privacidad y Datos</h3>
            
            <div className="settings-item">
              <div className="settings-item-info">
                <IoInformationCircle className="info-icon" />
                <div>
                  <div className="settings-item-title">Cache del navegador</div>
                  <div className="settings-item-description">
                    Tamaño actual: {formatBytes(cacheSize)}
                  </div>
                </div>
              </div>
              <button 
                className="settings-button" 
                onClick={handleClearCache}
                disabled={clearing}
              >
                <IoTrash /> Limpiar Cache
              </button>
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <IoInformationCircle className="info-icon" />
                <div>
                  <div className="settings-item-title">Cookies</div>
                  <div className="settings-item-description">
                    Eliminar todas las cookies guardadas
                  </div>
                </div>
              </div>
              <button 
                className="settings-button" 
                onClick={handleClearCookies}
                disabled={clearing}
              >
                <IoTrash /> Eliminar Cookies
              </button>
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <IoInformationCircle className="info-icon" />
                <div>
                  <div className="settings-item-title">Eliminar todos los datos</div>
                  <div className="settings-item-description">
                    Cache, cookies, y datos de sesión
                  </div>
                </div>
              </div>
              <button 
                className="settings-button danger" 
                onClick={handleClearAll}
                disabled={clearing}
              >
                <IoTrash /> Eliminar Todo
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>Información</h3>
            <div className="settings-info">
              <p><strong>Navegador Electron</strong></p>
              <p>Versión 1.0.0</p>
              <p className="settings-note">
                Este navegador guarda automáticamente cookies y cache para mantener tus sesiones activas.
                Los marcadores e historial se guardan localmente en tu dispositivo.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;

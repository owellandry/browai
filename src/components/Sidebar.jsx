import React from 'react';
import { IoClose } from 'react-icons/io5';
import './Sidebar.css';

function Sidebar({ content, bookmarks, history, onNavigate, onRemoveBookmark, onClose }) {
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>{content === 'bookmarks' ? 'Marcadores' : 'Historial'}</h3>
        <button className="close-sidebar" onClick={onClose}>
          <IoClose />
        </button>
      </div>
      
      <div className="sidebar-content">
        {content === 'bookmarks' && (
          <div className="bookmarks-list">
            {bookmarks.length === 0 ? (
              <p className="empty-message">No hay marcadores guardados</p>
            ) : (
              bookmarks.map(bookmark => (
                <div key={bookmark.id} className="bookmark-item">
                  <div 
                    className="bookmark-info"
                    onClick={() => onNavigate(bookmark.url)}
                  >
                    <div className="bookmark-title">{bookmark.title}</div>
                    <div className="bookmark-url">{bookmark.url}</div>
                  </div>
                  <button
                    className="remove-bookmark"
                    onClick={() => onRemoveBookmark(bookmark.id)}
                  >
                    <IoClose />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {content === 'history' && (
          <div className="history-list">
            {history.length === 0 ? (
              <p className="empty-message">No hay historial</p>
            ) : (
              [...history].reverse().map(item => (
                <div 
                  key={item.id} 
                  className="history-item"
                  onClick={() => onNavigate(item.url)}
                >
                  <div className="history-title">{item.title}</div>
                  <div className="history-url">{item.url}</div>
                  <div className="history-time">{formatDate(item.timestamp)}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;

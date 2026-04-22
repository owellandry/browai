import React, { useState, useEffect } from 'react';
import NavigationBar from './components/NavigationBar';
import TabBar from './components/TabBar';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import DevConsole from './components/DevConsole';
import MenuOverlay from './components/MenuOverlay';
import './App.css';

function App() {
  const [tabs, setTabs] = useState([
    { id: 1, url: 'https://www.google.com', title: 'Nueva pestaña', favicon: null, loading: false }
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarContent, setSidebarContent] = useState('bookmarks');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuButtonRect, setMenuButtonRect] = useState(null);
  const [menuActions, setMenuActions] = useState({});
  const [bookmarks, setBookmarks] = useState([
    { id: 1, title: 'Google', url: 'https://www.google.com' },
    { id: 2, title: 'GitHub', url: 'https://github.com' },
    { id: 3, title: 'Stack Overflow', url: 'https://stackoverflow.com' }
  ]);
  const [history, setHistory] = useState([]);

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  useEffect(() => {
    if (window.electronAPI) {
      // Configurar descargas
      window.electronAPI.setupDownloads();
      
      // Cargar datos persistentes
      loadPersistedData();
      
      // Crear vista inicial
      window.electronAPI.createView(1, 'https://www.google.com');
      window.electronAPI.switchView(1);

      // Listen for MCP-created tabs
      window.electronAPI.onMcpNewTab((viewId, url) => {
        setTabs(prev => [...prev, { id: viewId, url: url || 'about:blank', title: 'Nueva pestaña', favicon: null, loading: false }]);
        setActiveTabId(viewId);
      });

      // Escuchar actualizaciones de pestañas
      window.electronAPI.onTabUpdated((viewId, data) => {
        setTabs(prev => prev.map(tab => 
          tab.id === viewId ? { ...tab, ...data } : tab
        ));
      });

      window.electronAPI.onTabLoading((viewId, loading) => {
        setTabs(prev => prev.map(tab => 
          tab.id === viewId ? { ...tab, loading } : tab
        ));
      });

      // Escuchar eventos de descarga
      window.electronAPI.onDownloadStarted((data) => {
        console.log('Descarga iniciada:', data.fileName);
      });

      window.electronAPI.onDownloadCompleted((data) => {
        console.log('Descarga completada:', data.fileName);
      });
    }
  }, []);

  // Cargar datos persistentes
  const loadPersistedData = async () => {
    if (window.electronAPI) {
      const savedBookmarks = await window.electronAPI.loadData('bookmarks');
      const savedHistory = await window.electronAPI.loadData('history');
      
      if (savedBookmarks) {
        setBookmarks(savedBookmarks);
      }
      
      if (savedHistory) {
        setHistory(savedHistory);
      }
    }
  };

  // Guardar marcadores cuando cambien
  useEffect(() => {
    if (window.electronAPI && bookmarks.length > 0) {
      window.electronAPI.saveData('bookmarks', bookmarks);
    }
  }, [bookmarks]);

  // Guardar historial cuando cambie
  useEffect(() => {
    if (window.electronAPI && history.length > 0) {
      window.electronAPI.saveData('history', history);
    }
  }, [history]);

  const addTab = () => {
    const newTab = {
      id: Date.now(),
      url: 'https://www.google.com',
      title: 'Nueva pestaña',
      favicon: null,
      loading: false
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
    
    if (window.electronAPI) {
      window.electronAPI.createView(newTab.id, newTab.url);
      window.electronAPI.switchView(newTab.id);
    }
  };

  const closeTab = (tabId) => {
    if (window.electronAPI) {
      window.electronAPI.closeView(tabId);
    }
    
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    if (newTabs.length === 0) {
      addTab();
    } else {
      if (activeTabId === tabId) {
        const newActiveTab = newTabs[0];
        setActiveTabId(newActiveTab.id);
        if (window.electronAPI) {
          window.electronAPI.switchView(newActiveTab.id);
        }
      }
      setTabs(newTabs);
    }
  };

  const switchTab = (tabId) => {
    setActiveTabId(tabId);
    if (window.electronAPI) {
      window.electronAPI.switchView(tabId);
    }
  };

  const updateTab = (tabId, updates) => {
    setTabs(tabs.map(tab => 
      tab.id === tabId ? { ...tab, ...updates } : tab
    ));
  };

  const navigateToUrl = (url) => {
    let finalUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.')) {
        finalUrl = 'https://' + url;
      } else {
        finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(url);
      }
    }
    
    if (window.electronAPI) {
      window.electronAPI.navigateTo(activeTabId, finalUrl);
    }
    
    updateTab(activeTabId, { url: finalUrl });
    
    // Agregar al historial
    setHistory(prev => [...prev, {
      id: Date.now(),
      url: finalUrl,
      title: activeTab?.title || 'Cargando...',
      timestamp: new Date().toISOString()
    }]);
  };

  const handleBack = () => {
    if (window.electronAPI) {
      window.electronAPI.navigateBack(activeTabId);
    }
  };

  const handleForward = () => {
    if (window.electronAPI) {
      window.electronAPI.navigateForward(activeTabId);
    }
  };

  const handleReload = () => {
    if (window.electronAPI) {
      window.electronAPI.reloadPage(activeTabId);
    }
  };

  const addBookmark = () => {
    if (activeTab) {
      const newBookmark = {
        id: Date.now(),
        title: activeTab.title,
        url: activeTab.url
      };
      setBookmarks([...bookmarks, newBookmark]);
    }
  };

  const removeBookmark = (bookmarkId) => {
    setBookmarks(bookmarks.filter(b => b.id !== bookmarkId));
  };

  const handleMenuToggle = (isOpen, buttonRect, onOpenConsole, onOpenSettings) => {
    setMenuOpen(isOpen);
    setMenuButtonRect(buttonRect);
    setMenuActions({ onOpenConsole, onOpenSettings });
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setMenuButtonRect(null);
    setMenuActions({});
  };

  const toggleSidebar = (content) => {
    if (sidebarOpen && sidebarContent === content) {
      setSidebarOpen(false);
    } else {
      setSidebarContent(content);
      setSidebarOpen(true);
    }
  };

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={switchTab}
        onTabClose={closeTab}
        onAddTab={addTab}
      />
      <NavigationBar
        currentUrl={activeTab?.url || ''}
        loading={activeTab?.loading || false}
        menuOpen={menuOpen}
        onNavigate={navigateToUrl}
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onBookmark={addBookmark}
        onToggleBookmarks={() => toggleSidebar('bookmarks')}
        onToggleHistory={() => toggleSidebar('history')}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenConsole={() => setConsoleOpen(true)}
        onMenuToggle={handleMenuToggle}
      />
      <div className="content-area">
        {sidebarOpen && (
          <Sidebar
            content={sidebarContent}
            bookmarks={bookmarks}
            history={history}
            onNavigate={navigateToUrl}
            onRemoveBookmark={removeBookmark}
            onClose={() => setSidebarOpen(false)}
          />
        )}
        <div className="browser-placeholder">
          <p>El contenido web se muestra aquí mediante BrowserView de Electron</p>
        </div>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {consoleOpen && <DevConsole onClose={() => setConsoleOpen(false)} />}
      <MenuOverlay
        isOpen={menuOpen}
        onClose={closeMenu}
        onOpenConsole={menuActions.onOpenConsole}
        onOpenSettings={menuActions.onOpenSettings}
        buttonRect={menuButtonRect}
      />
    </div>
  );
}

export default App;

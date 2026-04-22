import React from 'react';
import { IoClose, IoAdd } from 'react-icons/io5';
import './TabBar.css';

function TabBar({ tabs, activeTabId, onTabClick, onTabClose, onAddTab }) {
  return (
    <div className="tab-bar">
      <div className="tabs-container">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onTabClick(tab.id)}
          >
            {tab.favicon && <img src={tab.favicon} alt="" className="tab-favicon" />}
            <span className="tab-title">{tab.title}</span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
            >
              <IoClose />
            </button>
          </div>
        ))}
      </div>
      <button className="add-tab-btn" onClick={onAddTab}>
        <IoAdd />
      </button>
    </div>
  );
}

export default TabBar;

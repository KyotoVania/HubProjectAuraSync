import React from 'react';
import { useConfigStore } from '../store/configStore';
import { scenes, scenesById } from '../scenes';
import type { SceneSettingControl } from '../scenes/sceneTypes';

export function ConfigPanel() {
  const {
    visualization,
    setVisualization,
    updateVisualizationSettings,
    showConfigPanel,
    toggleConfigPanel,
    activeConfigTab,
    setActiveConfigTab,
  } = useConfigStore();

  if (!showConfigPanel) {
    return (
      <button
        onClick={toggleConfigPanel}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1001,
          padding: '10px 15px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          border: '1px solid #333',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        ⚙️ Config
      </button>
    );
  }

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: '20px',
    right: '20px',
    zIndex: 1001,
    background: 'rgba(0,0,0,0.95)',
    color: 'white',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #333',
    width: '320px',
    maxHeight: '80vh',
    overflowY: 'auto',
    fontSize: '13px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px',
    marginTop: '4px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid #555',
    borderRadius: '4px',
    color: 'white',
    fontSize: '12px',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  const currentScene = scenesById[visualization.id];

  const renderControl = (key: string, control: SceneSettingControl) => {
    const value = visualization.settings[key];

    switch (control.type) {
      case 'slider':
        return (
          <div key={key} style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>{control.label}:</label>
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={value}
              onChange={(e) => updateVisualizationSettings({ [key]: parseFloat(e.target.value) })}
              style={inputStyle}
            />
            <span style={{ fontSize: '11px', color: '#aaa' }}>{value.toFixed(2)}</span>
          </div>
        );
      case 'color':
        return (
          <div key={key} style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>{control.label}:</label>
            <input
              type="color"
              value={value}
              onChange={(e) => updateVisualizationSettings({ [key]: e.target.value })}
              style={inputStyle}
            />
          </div>
        );
      case 'select':
        return (
          <div key={key} style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>{control.label}:</label>
            <select
              value={String(value)} // Ensure value is a string for the select
              onChange={(e) => {
                // Check if the value should be a boolean
                let newValue: any = e.target.value;
                if (e.target.value === 'true') {
                  newValue = true;
                } else if (e.target.value === 'false') {
                  newValue = false;
                }
                updateVisualizationSettings({ [key]: newValue });
              }}
              style={selectStyle}
            >
              {control.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>AuraSync Config</h3>
        <button
          onClick={toggleConfigPanel}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px' }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '1px solid #333' }}>
        {['global', 'visualization'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveConfigTab(tab as any)}
            style={{
              flex: 1,
              padding: '8px',
              background: activeConfigTab === tab ? '#0066cc' : 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontSize: '12px',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeConfigTab === 'global' && (
        <div>
          {/* Global settings controls here */}
        </div>
      )}

      {activeConfigTab === 'visualization' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Visualization Mode:</label>
            <select
              value={visualization.id}
              onChange={(e) => setVisualization(e.target.value)}
              style={selectStyle}
            >
              {scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          </div>

          {currentScene && Object.entries(currentScene.settings.schema).map(([key, control]) => renderControl(key, control))}
        </div>
      )}
    </div>
  );
}
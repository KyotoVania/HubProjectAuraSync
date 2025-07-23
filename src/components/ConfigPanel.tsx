import React from 'react'
import { useConfigStore } from '../store/configStore'
import type { ReactivityCurve, VisualizationMode } from '../types/config'

export function ConfigPanel() {
  const { 
    currentConfig, 
    updateGlobalSettings, 
    updateVisualizationMode,
    updateBars2DSettings,
    updateConstellationSettings,
    showConfigPanel, 
    toggleConfigPanel,
    activeConfigTab,
    setActiveConfigTab,
    presets,
    loadPreset
  } = useConfigStore()
  
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
          fontSize: '14px'
        }}
      >
        ⚙️ Config
      </button>
    )
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
    fontSize: '13px'
  }
  
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px',
    marginTop: '4px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid #555',
    borderRadius: '4px',
    color: 'white',
    fontSize: '12px'
  }
  
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer'
  }
  
  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>AuraSync Config</h3>
        <button
          onClick={toggleConfigPanel}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px' }}
        >
          ×
        </button>
      </div>
      
      {/* Presets */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Presets:</label>
        <select
          value={currentConfig.id}
          onChange={(e) => loadPreset(presets[e.target.value])}
          style={selectStyle}
        >
          {Object.keys(presets).map(presetId => (
            <option key={presetId} value={presetId}>
              {presets[presetId].global.name}
            </option>
          ))}
        </select>
      </div>
      
      {/* Tabs */}
      <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '1px solid #333' }}>
        {(['global', 'visualization'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveConfigTab(tab)}
            style={{
              flex: 1,
              padding: '8px',
              background: activeConfigTab === tab ? '#0066cc' : 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontSize: '12px'
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      
      {/* Global Settings */}
      {activeConfigTab === 'global' && (
        <div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>Volume Multiplier:</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={currentConfig.global.volumeMultiplier}
              onChange={(e) => updateGlobalSettings({ volumeMultiplier: parseFloat(e.target.value) })}
              style={inputStyle}
            />
            <span style={{ fontSize: '11px', color: '#aaa' }}>{currentConfig.global.volumeMultiplier.toFixed(1)}</span>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>FFT Smoothing:</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={currentConfig.global.fftSmoothing}
              onChange={(e) => updateGlobalSettings({ fftSmoothing: parseFloat(e.target.value) })}
              style={inputStyle}
            />
            <span style={{ fontSize: '11px', color: '#aaa' }}>{currentConfig.global.fftSmoothing.toFixed(2)}</span>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>Reactivity Curve:</label>
            <select
              value={currentConfig.global.reactivityCurve}
              onChange={(e) => updateGlobalSettings({ reactivityCurve: e.target.value as ReactivityCurve })}
              style={selectStyle}
            >
              <option value="linear">Linear</option>
              <option value="easeOutQuad">Ease Out Quad</option>
              <option value="exponential">Exponential</option>
            </select>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>Camera Orbit Speed:</label>
            <input
              type="range"
              min="0"
              max="0.2"
              step="0.01"
              value={currentConfig.global.cameraOrbitSpeed}
              onChange={(e) => updateGlobalSettings({ cameraOrbitSpeed: parseFloat(e.target.value) })}
              style={inputStyle}
            />
            <span style={{ fontSize: '11px', color: '#aaa' }}>{currentConfig.global.cameraOrbitSpeed.toFixed(2)}</span>
          </div>
        </div>
      )}
      
      {/* Visualization Settings */}
      {activeConfigTab === 'visualization' && (
        <div>
          {/* Mode Selector */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Visualization Mode:</label>
            <select
              value={currentConfig.visualization.mode}
              onChange={(e) => updateVisualizationMode(e.target.value as VisualizationMode)}
              style={selectStyle}
            >
              <option value="bars2d">Bars 2D (Equalizer)</option>
              <option value="grid2d">Grid 2D (Legacy)</option>
              <option value="constellation">Constellation Vivante ✨</option>
              <option value="tunnelsdf">Tunnel SDF 🚀 (Demo-style)</option>
              <option value="sphere2d">Sphere 2D (Coming Soon)</option>
              <option value="wave">Wave (Coming Soon)</option>
              <option value="tunnel3d">Tunnel 3D (Coming Soon)</option>
              <option value="sphere3d">Sphere 3D (Coming Soon)</option>
            </select>
          </div>
          
          {/* Bars2D Settings */}
          {currentConfig.visualization.mode === 'bars2d' && currentConfig.visualization.bars2d && (
            <div>
              <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '14px' }}>Bars 2D Settings</h4>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>Bar Count:</label>
                <input
                  type="range"
                  min="8"
                  max="128"
                  step="8"
                  value={currentConfig.visualization.bars2d.barCount}
                  onChange={(e) => updateBars2DSettings({ barCount: parseInt(e.target.value) })}
                  style={inputStyle}
                />
                <span style={{ fontSize: '11px', color: '#aaa' }}>{currentConfig.visualization.bars2d.barCount}</span>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>Max Height:</label>
                <input
                  type="range"
                  min="2"
                  max="20"
                  step="0.5"
                  value={currentConfig.visualization.bars2d.maxHeight}
                  onChange={(e) => updateBars2DSettings({ maxHeight: parseFloat(e.target.value) })}
                  style={inputStyle}
                />
                <span style={{ fontSize: '11px', color: '#aaa' }}>{currentConfig.visualization.bars2d.maxHeight}</span>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>Color Mode:</label>
                <select
                  value={currentConfig.visualization.bars2d.colorMode}
                  onChange={(e) => updateBars2DSettings({ colorMode: e.target.value as any })}
                  style={selectStyle}
                >
                  <option value="frequency">Frequency Based</option>
                  <option value="rainbow">Rainbow Spectrum</option>
                  <option value="single">Single Color</option>
                </select>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>Smoothing:</label>
                <input
                  type="range"
                  min="0"
                  max="0.95"
                  step="0.05"
                  value={currentConfig.visualization.bars2d.smoothing}
                  onChange={(e) => updateBars2DSettings({ smoothing: parseFloat(e.target.value) })}
                  style={inputStyle}
                />
                <span style={{ fontSize: '11px', color: '#aaa' }}>{currentConfig.visualization.bars2d.smoothing.toFixed(2)}</span>
              </div>
            </div>
          )}
          
          {/* Constellation Settings */}
          {currentConfig.visualization.mode === 'constellation' && currentConfig.visualization.constellation && (
            <div>
              <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '14px' }}>Constellation Settings</h4>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>Particle Count:</label>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  step="50"
                  value={currentConfig.visualization.constellation.particleCount}
                  onChange={(e) => updateConstellationSettings({ particleCount: parseInt(e.target.value) })}
                  style={inputStyle}
                />
                <span style={{ fontSize: '11px', color: '#aaa' }}>{currentConfig.visualization.constellation.particleCount}</span>
              </div>
              
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>Formation:</label>
                <select
                  value={currentConfig.visualization.constellation.formation}
                  onChange={(e) => updateConstellationSettings({ formation: e.target.value as any })}
                  style={selectStyle}
                >
                  <option value="sphere">Sphere</option>
                  <option value="spiral">Spiral</option>
                  <option value="dnahelix">DNA Helix</option>
                  <option value="cube">Cube</option>
                  <option value="torus">Torus</option>
                  <option value="random">Random</option>
                </select>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>Connection Distance:</label>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="0.5"
                  value={currentConfig.visualization.constellation.connectionDistance}
                  onChange={(e) => updateConstellationSettings({ connectionDistance: parseFloat(e.target.value) })}
                  style={inputStyle}
                />
                <span style={{ fontSize: '11px', color: '#aaa' }}>{currentConfig.visualization.constellation.connectionDistance.toFixed(1)}</span>
              </div>
              
            </div>
          )}

          {/* Grid2D Settings (Legacy) */}
          {currentConfig.visualization.mode === 'grid2d' && currentConfig.visualization.grid2d && (
            <div>
              <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '14px' }}>Grid 2D Settings (Legacy)</h4>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
                Legacy mode - consider switching to Bars 2D for better visuals
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
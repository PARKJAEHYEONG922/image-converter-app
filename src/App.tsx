import { useState, useEffect } from 'react';
import ImageConverter from './components/ImageConverter';
import ApiSettings from './components/ApiSettings';
import { initializeGemini } from './services/gemini';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    // Load API settings on app start
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.getApiSettings();
        if (settings.geminiApiKey) {
          initializeGemini(settings.geminiApiKey);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };

    loadSettings();
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Main Content - No header */}
      <div className="flex-1 overflow-hidden">
        <ImageConverter onSettingsOpen={() => setIsSettingsOpen(true)} />
      </div>

      {/* API Settings Modal */}
      <ApiSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
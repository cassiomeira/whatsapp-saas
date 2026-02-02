
import React, { useState } from 'react';
import { Copy, Check, FileCode, Terminal, Download } from 'lucide-react';

const codeFiles = {
  'App.tsx': `import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import WebScreen from './screens/WebScreen';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <WebScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});`,
  'screens/WebScreen.tsx': `import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, SafeAreaView, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Camera from 'expo-camera';
import { Audio } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';

export default function WebScreen() {
  const [hasPermission, setHasPermission] = useState(null);

  useEffect(() => {
    (async () => {
      // 1. Solicita Câmera
      const { status: camStatus } = await Camera.requestCameraPermissionsAsync();
      
      // 2. Solicita Microfone e configura para modo "Gravação/Playback"
      const { status: micStatus } = await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // 3. Solicita acesso à Galeria/Arquivos
      const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
      
      setHasPermission(
        camStatus === 'granted' && 
        micStatus === 'granted' && 
        mediaStatus === 'granted'
      );
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <WebView 
          source={{ uri: 'https://whatsapp-saas-7duy.onrender.com/kanban' }}
          style={styles.web}
          
          // Essencial para WhatsApp Web / CRM
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          
          // Permite upload de arquivos (abre Galeria/Arquivos automaticamente)
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          
          // Barra de carregamento
          startInLoadingState={true}
          renderLoading={() => (
            <ActivityIndicator 
              color="#007AFF" 
              size="large" 
              style={styles.loader} 
            />
          )}
          
          // Garante que o hardware seja liberado para a WebView
          originWhitelist={['*']}
          onPermissionRequest={(event) => {
            event.grant(); 
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1 },
  web: { flex: 1, backgroundColor: '#000' },
  loader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -20 }, { translateY: -20 }]
  }
});`
};

export const NativeCodePanel: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<keyof typeof codeFiles>('App.tsx');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeFiles[selectedFile]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex overflow-hidden animate-in fade-in duration-500">
      <div className="w-64 border-r border-zinc-800 bg-[#0f0f0f] p-4 hidden md:block">
        <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-4">Arquivos do App</h3>
        <div className="space-y-1">
          {Object.keys(codeFiles).map((file) => (
            <button
              key={file}
              onClick={() => setSelectedFile(file as keyof typeof codeFiles)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${selectedFile === file ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
            >
              <FileCode size={16} />
              {file}
            </button>
          ))}
        </div>

        <div className="mt-8 pt-4 border-t border-zinc-800">
           <h4 className="text-[10px] text-zinc-500 font-bold uppercase mb-2">Instalar via Terminal:</h4>
           <div className="p-2 bg-black rounded text-[10px] text-blue-400 font-mono leading-tight">
             npx expo install react-native-webview expo-camera expo-av expo-media-library
           </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-[#050505]">
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-[#0a0a0a]">
          <span className="text-sm font-mono text-zinc-300">{selectedFile}</span>
          <button 
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-xs font-medium transition-all"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            {copied ? 'Copiado' : 'Copiar Código'}
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-6 font-mono text-sm leading-relaxed">
           <pre className="text-zinc-300 whitespace-pre-wrap">
             {codeFiles[selectedFile]}
           </pre>
        </div>
      </div>
    </div>
  );
};

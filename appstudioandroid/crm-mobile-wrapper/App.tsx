
import React, { useState } from 'react';
import { MobileSimulator } from './components/MobileSimulator';
import { NativeCodePanel } from './components/NativeCodePanel';
import { Terminal, Phone, Code2, Rocket, Mic, Paperclip } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code'>('simulator');

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#121212] z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Rocket size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg">CRM Native Wrapper</h1>
            <p className="text-xs text-zinc-400">Suporte a Arquivos & Microfone</p>
          </div>
        </div>
        
        <nav className="flex bg-zinc-900 rounded-full p-1 border border-zinc-800">
          <button onClick={() => setActiveTab('simulator')} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'simulator' ? 'bg-zinc-700 text-white' : 'text-zinc-500'}`}>
            <Phone size={16} /> Simulator
          </button>
          <button onClick={() => setActiveTab('code')} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'code' ? 'bg-zinc-700 text-white' : 'text-zinc-500'}`}>
            <Code2 size={16} /> Native Source
          </button>
        </nav>

        <div className="hidden md:flex items-center gap-2 text-zinc-400 text-sm">
          <Terminal size={14} />
          <span>v1.2.0-full-hardware</span>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
        {activeTab === 'simulator' ? (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-zinc-900 to-black p-4 md:p-8">
             <div className="w-full max-w-[420px] h-[80vh] md:h-[85vh] shadow-2xl relative">
                <MobileSimulator />
             </div>
             <div className="hidden lg:flex flex-col gap-6 ml-12 max-w-sm">
                <div className="p-6 bg-zinc-800/50 rounded-2xl border border-zinc-700/50 backdrop-blur-md">
                   <div className="flex items-center gap-2 text-blue-400 mb-2">
                     <Mic size={20} />
                     <h3 className="font-bold text-xl">Mensagens de Voz</h3>
                   </div>
                   <p className="text-zinc-300 text-sm leading-relaxed">
                     O app pré-configura o modo de áudio do iOS/Android para garantir que a gravação funcione dentro da WebView sem conflitos.
                   </p>
                </div>
                <div className="p-6 bg-zinc-800/50 rounded-2xl border border-zinc-700/50 backdrop-blur-md">
                   <div className="flex items-center gap-2 text-orange-400 mb-2">
                     <Paperclip size={20} />
                     <h3 className="font-bold text-xl">Anexos e Arquivos</h3>
                   </div>
                   <p className="text-zinc-300 text-sm leading-relaxed">
                     Ao clicar em "anexar" no seu site, o app abrirá automaticamente o seletor nativo de fotos e documentos do celular.
                   </p>
                </div>
             </div>
          </div>
        ) : (
          <NativeCodePanel />
        )}
      </main>
    </div>
  );
};

export default App;


import React, { useState, useEffect } from 'react';
import { Wifi, Battery, Signal, LayoutDashboard, MessageSquare, User, Plus, RefreshCw } from 'lucide-react';

export const MobileSimulator: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full h-full bg-black rounded-[3rem] border-[8px] border-zinc-800 shadow-2xl overflow-hidden flex flex-col relative">
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-zinc-800 rounded-b-2xl z-50"></div>
      
      {/* Status Bar */}
      <div className="px-8 pt-6 pb-2 flex justify-between items-center text-[10px] font-bold text-zinc-400 bg-black z-40">
        <span>9:41</span>
        <div className="flex gap-1.5 items-center">
          <Signal size={10} />
          <Wifi size={10} />
          <Battery size={12} className="rotate-0" />
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-black relative animate-in fade-in duration-700">
         {/* Simulated WebView Area */}
         <div className="flex-1 relative">
            {isLoading && (
              <div className="absolute inset-0 z-30 bg-[#121212] flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-zinc-500 text-xs font-medium animate-pulse">Conectando ao sistema...</p>
              </div>
            )}
            
            <iframe 
               src="https://whatsapp-saas-7duy.onrender.com/kanban" 
               className="w-full h-full border-none"
               title="CRM WebView"
               onLoad={() => setIsLoading(false)}
             />

             {/* FAB - Só aparece depois do "login" simulado no iframe */}
             {!isLoading && (
               <button className="absolute bottom-6 right-6 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-2xl text-white hover:scale-110 transition-transform active:scale-95">
                 <Plus size={32} />
               </button>
             )}
         </div>

         {/* Bottom Tab Bar (Opcional, pode ser removido se o site já tiver navegação) */}
         <div className="h-20 bg-[#121212] border-t border-zinc-800/50 flex justify-around items-center px-4 pb-4">
           <div className="flex flex-col items-center gap-1 text-blue-500">
             <LayoutDashboard size={22} />
             <span className="text-[9px] font-bold uppercase tracking-tight">Home</span>
           </div>
           <button onClick={() => window.location.reload()} className="flex flex-col items-center gap-1 text-zinc-500">
             <RefreshCw size={22} />
             <span className="text-[9px] font-bold uppercase tracking-tight">Atualizar</span>
           </button>
           <div className="flex flex-col items-center gap-1 text-zinc-500">
             <User size={22} />
             <span className="text-[9px] font-bold uppercase tracking-tight">Conta</span>
           </div>
         </div>
      </div>

      {/* Home Indicator */}
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-zinc-700 rounded-full"></div>
    </div>
  );
};

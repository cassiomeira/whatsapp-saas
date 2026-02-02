# Dev Notes & Contexto do Projeto

Este arquivo serve para orientar o desenvolvimento e manter o contexto para a IA e desenvolvedores.

## funcionalidade de Câmera/Vídeo (Discovery: 01/02/2026)
- **Localização**: `client/src/pages/Kanban.tsx` (Componente `ChatPanel`)
- **Recursos**:
  - Captura de Foto e Vídeo (usando componente `CameraCapture.tsx`)
  - Conversão de Áudio (WebM -> OGG) para compatibilidade com WhatsApp
  - Envio de anexos (imagem, vídeo, áudio, documentos)
  - Visualização de mídia enviada/recebida no chat lateral
- **Obs**: A funcionalidade **NÃO** está presente no `Inbox.tsx` (apenas no chat lateral do Kanban).

## Estrutura do Projeto
- **Frontend**: React + Vite (client)
- **Backend**: Node.js + tRPC (server)
- **Mobile**: React Native + Expo (mobile)
- **Cores Especiais**:
  - Kanban Seller: `bg-emerald-500`
  - Kanban Default: `bg-blue-500`, `bg-orange-500`, etc.

## Próximos Passos (Sugestões)
- Trazer a funcionalidade de câmera completa para o `Inbox.tsx` para unificar a experiência.
- Melhorar o App Mobile (que está básico).

# WhatsApp SaaS Platform - TODO

## Tarefas Urgentes
- [x] Sincronizar status da instância WhatsApp em tempo real
- [x] Implementar atualização automática de status
- [x] Implementar filtro para ignorar mensagens de grupos
- [x] Webhook funcional para receber mensagens - CORRIGIDO (rota não estava registrada no Express)
- [x] Sistema de respostas automáticas da IA

## Bugs Urgentes
- [x] Status da instância não atualiza automaticamente na interface
- [x] Webhook configurado - IA agora recebe mensagens

## Bugs
- [x] Erro "No workspace" quando usuário loga pela primeira vez
- [x] Criar tela de onboarding para criar workspace inicial
- [x] Erro ao salvar metadata do workspace (precisa converter para JSON string)
- [x] Erro genérico ao criar instância - melhorar tratamento de erros
- [x] Sistema não estava usando configurações do workspace para Evolution API

## Fase 1: Infraestrutura e Autenticação
- [x] Configurar esquema do banco de dados multi-tenant
- [x] Implementar sistema de workspaces
- [x] Sistema de autenticação com roles (admin/agent)
- [ ] Gestão de usuários e convites

## Novas Funcionalidades
- [x] Interface de configuração da Evolution API (URL + API Key)
- [x] Página de Settings completa

## Fase 2: Integração WhatsApp
- [x] Criar serviço de integração com Evolution API
- [x] Sistema de conexão via QR Code
- [x] Gerenciamento de múltiplas instâncias WhatsApp
- [x] Webhook para receber mensagens
- [x] Envio de mensagens (texto, imagem, áudio, vídeo)
- [x] Interface para conectar/desconectar WhatsApp
- [x] Sincronização de status da conexão

## Fase 3: Sistema de Atendimento
- [x] Caixa de entrada (Inbox) de conversas
- [x] Interface de chat em tempo real
- [x] Sistema de "assumir conversa"
- [x] Histórico de mensagens
- [ ] Notificações em tempo real

## Fase 4: Automação e IA
- [x] Configuração de prompt mestre para IA
- [x] Integração com IA para respostas automáticas
- [x] Sistema de regras de transbordo
- [ ] Construtor de fluxos de conversa
- [ ] Gatilhos e condições

## Fase 5: CRM e Gestão
- [x] CRM Kanban visual com drag & drop
- [ ] Gestão de contatos/leads
- [ ] Etiquetas e categorização
- [ ] Dashboard com estatísticas
- [ ] Relatórios de atendimento

## Fase 6: Recursos Avançados
- [ ] Disparos em massa
- [ ] Remarketing inteligente
- [ ] Rastreamento de anúncios
- [ ] Gerenciador de grupos
- [ ] Sistema de departamentos

## Fase 7: Interface e UX
- [x] Design system e tema
- [x] Navegação principal
- [x] Páginas de dashboard
- [x] Responsividade mobile
- [x] Animações e transições



## Integração IXC Soft (ERP Provedor)
- [ ] Criar serviço de integração com IXC Soft API
- [ ] Configuração de token IXC nas settings do workspace
- [ ] Consultar faturas em aberto do cliente (por CPF/CNPJ ou telefone)
- [ ] IA detecta quando cliente pergunta sobre fatura/débito
- [ ] IA envia informações da fatura automaticamente
- [ ] Implementar desbloqueio de confiança via API IXC
- [ ] IA detecta pedido de desbloqueio e executa automaticamente
- [ ] Logs de ações executadas (consultas e desbloqueios)
- [ ] Interface de configuração IXC nas Settings



## Bugs Reportados e Corrigidos
- [x] CRM Kanban: drag & drop não estava funcionando (contatos não mudavam de coluna ao arrastar) - CORRIGIDO

## Melhorias Implementadas
- [x] Suporte a áudio: IA agora transcreve áudios recebidos automaticamente e processa o texto
- [x] Suporte a imagens: IA agora analisa imagens recebidas usando GPT-4 Vision e responde adequadamente
- [x] Processamento de mídia no webhook (áudio + imagem) totalmente integrado



## Bugs Urgentes Reportados
- [x] Adicionar botão "Reconectar" nas instâncias já criadas para gerar novo QR Code - IMPLEMENTADO
- [x] Erro ao salvar QR Code no campo phoneNumber - CORRIGIDO (ordem dos parâmetros estava errada)
- [ ] Nova instância "Netcar" criada mas não conectou (status: Desconectado, Aguardando conexão) - SOLUÇÃO: usar botão Reconectar
- [ ] Investigar por que instâncias ficam travadas em "Aguardando conexão" - pode ser timeout do QR Code



## Novos Bugs Reportados
- [x] Adicionar botão "Remover" para excluir instâncias WhatsApp - IMPLEMENTADO
- [ ] Sistema parou de funcionar após desconectar e reconectar WhatsApp (funcionou na primeira vez, mas não na segunda)
- [ ] Investigar por que webhook não recebe mais mensagens após reconexão
- [ ] Adicionar logs detalhados no webhook para debug



## BUG CRÍTICO IDENTIFICADO E CORRIGIDO
- [x] Webhook NÃO estava sendo configurado na Evolution API ao criar instância - CORRIGIDO
- [x] Adicionada configuração de webhook no createInstance - IMPLEMENTADO
- [x] Adicionada configuração de webhook no reconnect - IMPLEMENTADO
- [x] Webhook URL configurada: {WEBHOOK_URL}/api/webhook/evolution



## URGENTE - Webhook não configurado em instância antiga
- [ ] Usuário precisa configurar webhook manualmente OU criar nova instância
- [ ] Script fix-webhook.sh criado para configurar webhook
- [ ] Instruções detalhadas em INSTRUCOES-WEBHOOK.md
- [ ] Problema: instância ws1_1761612053209 não tem webhook configurado
- [ ] Solução 1: Executar fix-webhook.sh com API Key
- [ ] Solução 2: Remover instância antiga e criar nova (webhook automático)



## URGENTE - Adicionar campo Webhook URL nas configurações
- [x] Adicionar campo "Webhook URL" na página de Configurações - IMPLEMENTADO
- [x] Permitir usuário configurar URL do ngrok - IMPLEMENTADO
- [x] Usar essa URL ao criar/reconectar instâncias - JÁ IMPLEMENTADO
- [x] Problema: sistema usa localhost:3000 ao invés da URL do ngrok - CORRIGIDO



## BUG CRÍTICO CORRIGIDO - Webhook não estava registrado no servidor
- [x] Rota /api/webhook/evolution não estava registrada no Express - CORRIGIDO
- [x] Webhook retornava HTML ao invés de processar POST requests - CORRIGIDO
- [x] Adicionada importação de handleEvolutionWebhook no server/_core/index.ts
- [x] Registrada rota POST /api/webhook/evolution antes das rotas OAuth
- [x] Webhook agora responde corretamente com JSON {"success":true}
- [x] Testado com curl: webhook processa mensagens e salva no banco
- [x] Contatos são criados automaticamente
- [x] Conversas são criadas no banco
- [x] Mensagens são salvas corretamente
- [x] TESTE FINAL: Mensagens chegam no sistema e IA responde na interface
- [x] BUG CORRIGIDO: Formato de mensagem estava incorreto (text ao invés de textMessage.text)
- [x] Corrigido para usar formato correto da Evolution API v1: {"textMessage": {"text": "..."}}
- [x] TESTE CONCLUÍDO: IA agora envia respostas para o WhatsApp do usuário com sucesso! ✅

## BUG REPORTADO - CRM Kanban não funcionando
- [x] Investigar problema no CRM Kanban
- [x] Verificar drag and drop
- [x] Verificar exibição de contatos
- [x] Corrigir funcionalidade
- [x] Adicionado closestCenter collision detection
- [x] IDs únicos para cards (contact-{id})
- [x] Melhorado sensor e feedback visual
- [x] Implementado DroppableColumn com useDroppable
- [ ] TESTE: Verificar se drag and drop funciona corretamente

## NOVA FUNCIONALIDADE - Integração IXC Soft (ERP Provedor) ✅
- [x] Criar serviço de integração com IXC Soft API (ixcService.ts)
- [x] Adicionar campos de configuração (URL + Token) nas Settings
- [x] Implementar consulta de faturas em aberto por CPF/CNPJ/Telefone
- [x] IA detecta quando cliente pergunta sobre fatura/débito
- [x] IA envia informações da fatura automaticamente
- [x] Implementar desbloqueio de confiança via API IXC
- [x] IA detecta pedido de desbloqueio e executa automaticamente
- [x] Logs de ações executadas (console.log)
- [x] Interface de configuração IXC nas Settings (aba IXC Soft)
- [x] Configurações salvas no banco de dados
- [ ] TESTE: Enviar mensagem real e verificar consulta/desbloqueio
- [ ] Atualizar token IXC para o correto (10/901bfe8956814be1e3621c552e3fcba62456f4d74cc5c9a5804443e9f79303a0)

## NOVA FUNCIONALIDADE - Atendimento Humano no Kanban
- [x] Adicionar coluna "Aguardando Atendente" no Kanban (cor laranja)
- [x] Clicar no card do Kanban abre conversa do contato (navega para /inbox?contact=ID)
- [x] IA detecta quando cliente pede atendente humano (detectarPedidoAtendente)
- [x] IA transfere automaticamente para coluna "Aguardando Atendente" (updateContactKanbanStatus)
- [x] IA avisa cliente que está transferindo para atendente humano (gerarMensagemTransferencia)
- [x] Mostrar número do WhatsApp nos cards do Kanban (já estava implementado)
- [x] Abrir chat na mesma tela do Kanban (painel lateral direito)
- [x] Interface de chat integrada ao Kanban com mensagens em tempo real
- [x] Buscar mensagens da conversa via tRPC
- [x] Enviar mensagens do atendente via tRPC
- [ ] Pausar IA automaticamente quando atendente assumir conversa manualmente
- [ ] Botão para atendente assumir/pausar IA na interface de chat
- [x] BUG CORRIGIDO: Campo de input do chat lateral fica fora da tela - Alterado ScrollArea para div com overflow-y-auto e flex-shrink-0 no input
- [x] Remover toast "Mensagem enviada" que atrapalha digitação
- [x] Adicionar botão para expandir chat em tela cheia (botão Maximize2 no header)
- [x] BUG CRÍTICO CORRIGIDO: Mensagens do atendente agora são enviadas para WhatsApp via Evolution API
- [x] BUG CORRIGIDO: IA para de responder quando cliente está em "Aguardando Atendente"
- [x] Implementado: IA verifica kanbanStatus antes de responder
- [x] Implementado: IA volta a responder automaticamente quando cliente sair da coluna "Aguardando Atendente"
- [x] Implementar atualização automática de mensagens em tempo real (polling a cada 3 segundos)
- [x] Scroll automático para última mensagem quando novas mensagens chegam

## NOVA FUNCIONALIDADE - Sistema de Aprovação de Usuários
- [x] Adicionar campo "status" na tabela users (pending/approved/blocked)
- [x] Novos cadastros começam como "pending" automaticamente (default no schema)
- [x] Owner do workspace é "approved" automaticamente (UPDATE SQL executado)
- [x] Middleware para bloquear acesso de usuários não aprovados (requireApprovedUser)
- [x] Página de Administração com lista de usuários (/users)
- [x] Botões para aprovar/bloquear usuários
- [x] Tela de "Aguardando aprovação" para usuários pendentes (/pending)
- [x] Notificação visual para admin quando há usuários pendentes (badge com contador)
- [x] Menu "Usuários" visível apenas para owner
- [x] Rotas tRPC: admin.listUsers, admin.approveUser, admin.blockUser
- [x] Funções DB: getUsersByWorkspace, updateUserStatus



## NOVA TAREFA - Preparar deploy para Render
- [x] Criar arquivo render.yaml com configurações
- [x] Ajustar package.json para build unificado
- [x] Criar scripts de build e start (render:build e render:start)
- [x] Documentar processo de deploy (DEPLOY_RENDER.md)
- [x] Configurações prontas para deploy

## BUG CRÍTICO - Bot não envia respostas para WhatsApp
- [x] IA processa mensagens e salva resposta no banco
- [x] Implementado envio de resposta de volta para o WhatsApp via Evolution API
- [x] Usando evolutionService.sendTextMessage com configuração do workspace



## BUG CRÍTICO - Status nunca muda para "Conectado"
- [ ] Instâncias sempre aparecem como "Desconectado" mesmo após escanear QR Code
- [ ] Sistema não recebe evento CONNECTION_UPDATE da Evolution API
- [ ] Webhook precisa ser configurado ANTES de gerar QR Code
- [ ] Adicionar polling automático para atualizar status das instâncias
- [ ] Verificar se webhookHandler está processando CONNECTION_UPDATE corretamente


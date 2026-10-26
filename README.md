# Dominó Clássico Online — V13 (salas independentes)

## Publicação na Vercel
1. Envie o conteúdo desta pasta para seu repositório GitHub.
2. Importe o repositório na Vercel. Framework: Other.
3. Configure `REDIS_URL` nas variáveis de ambiente do projeto. O Redis deve aceitar o protocolo Redis usado pelo pacote ioredis.
4. Faça um novo deploy.
5. Acesse seu domínio, clique em **Criar sala** e compartilhe o link exibido.

## Regras das salas
- Cada sala recebe um código aleatório de seis caracteres e uma URL `/?room=CODIGO`.
- Somente o criador administra configurações e inicia a partida.
- Um convidado pode ocupar uma cadeira ou assistir.
- Jogadores em salas diferentes não compartilham partidas nem pontuação.
- O anfitrião recupera seus direitos ao recarregar a página na mesma aba (token da sessão).
- Salas sem atualização expiram após sete dias no Redis.
- Sem REDIS_URL, `npm start` permite testes em uma única instância local, mas não é adequado para produção com múltiplas instâncias.

## Execução local
`npm install && npm start` e acesse `http://localhost:3000`.

## Limitações e avisos
- É necessário validar a compatibilidade do WebSocket com o ambiente atual da Vercel; se a plataforma não sustentar upgrades WebSocket persistentes no deployment, será necessário separar a hospedagem do servidor realtime (Railway/Render/Fly) ou usar provedor de realtime.
- Reconexão conserva identidade na mesma aba; abrir o convite em outra aba é outro participante.
- Código de sala é um convite, não um mecanismo de autenticação forte.

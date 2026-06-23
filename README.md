# Portal PSEU

Portal estático com pré-portal narrativo, biblioteca viva, dois VSLs, leitor imersivo de PDFs e observação comportamental local.

Este README descreve o checkpoint oficial criado em 30 de maio de 2026. O estado técnico detalhado está em `CHECKPOINT_TECNICO.md` e o histórico recente está em `CHANGELOG.md`.

## Como rodar

O projeto não exige build. Sirva a pasta raiz por HTTP para que vídeos, PDFs e armazenamento local funcionem corretamente.

Opção com Python:

```powershell
cd F:\Marketing\Pseu
python -m http.server 4173
```

Opção com Node.js:

```powershell
cd F:\Marketing\Pseu
npx serve . -l 4173
```

Depois abra:

```text
http://127.0.0.1:4173/
```

O painel local de observação fica em:

```text
http://127.0.0.1:4173/admin-local.html
```

Evite abrir `index.html` diretamente por `file://`. Alguns navegadores bloqueiam recursos locais, PDFs ou persistência nesse modo.

## Links diretos para revisão visual

Quando o servidor local estiver ativo em `5500`, use:

```text
Página 1 / Chamado:       http://127.0.0.1:5500/#chamado
Página 2 / Biblioteca:    http://127.0.0.1:5500/#biblioteca
Página 3 / Travessia:     http://127.0.0.1:5500/#travessia
Oferta:                   http://127.0.0.1:5500/#oferta
Portal interno:           http://127.0.0.1:5500/#portal
Painel admin local:       http://127.0.0.1:5500/admin-local.html
Atalho do painel admin:   http://127.0.0.1:5500/#admin-pseu
```

Os mesmos hashes funcionam se o servidor for iniciado manualmente em `4173`; basta trocar a porta na URL.

O alias `#portal` usa o mesmo desbloqueio local do CTA final para permitir a revisão direta do Portal interno. O fluxo manual continua disponível normalmente:

```text
Chamado → Biblioteca → Travessia → Portal interno
```

## Fluxo atual

1. `Chamado`: entrada visual e narrativa.
2. `Biblioteca do Despertar`: apresentação dos 18 livros.
3. `Travessia`: VSL principal, continuação e VSL de oferta.
4. `Desbloqueio`: botão `Entrar no Portal PSEU`.
5. `Portal interno`: arquivo reservado, biblioteca, leitor e continuidade da jornada.

O desbloqueio é persistido no navegador por `localStorage`.

## Fluxo oficial reconstruído

O pré-portal funciona como uma travessia vertical contínua:

```text
Página 1 / Chamado
  ↓
Página 2 / Biblioteca editorial
  ↓
Fragmento parcialmente revelado do Manual do Despertar
  ↓
Página 3 / Travessia
  ↓
VSL 1 / aprofundamento
  ↓
Descida narrativa e passagem de acesso
  ↓
VSL 2 / confirmação
  ↓
Portal interno
```

O fragmento externo usa somente cinco páginas-curadoria do PDF oficial do `Manual do Despertar`: `03`, `13`, `19`, `31` e `51`. Ele possui navegação isolada e não modifica o reader completo reservado ao Portal interno.

Para revisar diretamente o fragmento:

1. Abra `http://127.0.0.1:5500/#biblioteca`.
2. Desça até `Arquivo parcialmente revelado · Manual do Despertar`.
3. Clique em `Ler fragmento revelado`.

Também é possível abrir o mesmo arquivo parcial clicando no `Manual do Despertar` dentro da composição editorial externa.

## Estrutura principal

```text
Pseu/
|-- index.html
|-- admin-local.html
|-- README.md
|-- CHANGELOG.md
|-- CHECKPOINT_TECNICO.md
|-- css/
|   |-- style.css
|   `-- admin.css
|-- js/
|   |-- main.js
|   |-- funnel-config.js
|   |-- atmosphere.js
|   |-- analytics.js
|   |-- admin.js
|   `-- books/
|       |-- book-config.js
|       |-- book-registry.js
|       |-- book-diagnostics.js
|       `-- README.md
|-- livros/
|   |-- capas do livros difinitivo/
|   |-- o livro despertar/
|   `-- Lider estoico/
|-- PCL/
|   `-- assets/images/visuals/
|-- 0509 vsl 1 de cima Pseu.mp4
|-- IMG_6166.MOV
`-- _BACKUP_CHECKPOINT/
```

## Arquivos principais

- `index.html`: estrutura das páginas, textos estáticos e carregamento dos scripts.
- `css/style.css`: identidade visual, responsividade e reader.
- `js/main.js`: navegação, biblioteca, VSLs, desbloqueio, persistência e reader.
- `js/funnel-config.js`: referências do funil, vídeos e pôsteres responsivos.
- `js/atmosphere.js`: atmosfera contextual, transições ambientais e degradação progressiva por dispositivo.
- `js/analytics.js`: sessões locais, tracking comportamental, progresso do funil e exportação JSON.
- `admin-local.html`: centro local de observação acessado diretamente pela URL.
- `css/admin.css`: identidade visual isolada do painel administrativo.
- `js/admin.js`: leitura e renderização dos dados locais no painel.
- `js/books/book-config.js`: schema e normalização oficial dos livros.
- `js/books/book-registry.js`: catálogo atual de 18 livros.
- `js/books/book-diagnostics.js`: diagnósticos opcionais do catálogo e reader.

## PDFs

Os PDFs ativos ficam dentro de `livros/`.

- Livro 01: `livros/o livro despertar/`
- Livro 02: `livros/Lider estoico/`

O caminho exato usado pelo reader é cadastrado na propriedade `pdf` de cada livro em `js/books/book-registry.js`.

## VSLs

Os vídeos ativos ficam na raiz:

- VSL principal: `0509 vsl 1 de cima Pseu.mp4`
- VSL de oferta: `IMG_6166.MOV`

As referências são centralizadas em `js/funnel-config.js`.

Para trocar um vídeo:

1. Coloque o novo arquivo na raiz ou defina seu caminho relativo.
2. Atualize `window.VSL_PRINCIPAL_URL` ou `window.VSL_OFERTA_URL` em `js/funnel-config.js`.
3. Valide reprodução, pausa e alternância entre os dois vídeos.
4. Valide desktop e mobile.

## Capas e assets

- Capas dos livros: `livros/capas do livros difinitivo/`
- Assets visuais do funil: `PCL/assets/images/visuals/`
- Pôsteres desktop dos VSLs: arquivos `*-16x9.svg`
- Pôsteres mobile dos VSLs: arquivos `*-9x16.svg`

## Como editar textos

- Chamado, biblioteca externa, travessia e textos estáticos internos: `index.html`
- Microcopys dinâmicas, mensagens do reader e estados de jornada: `js/main.js`
- Títulos, resumos, capítulos e frases dos livros: `js/books/book-registry.js`

Antes de editar, preserve a codificação UTF-8 para não corromper acentos.

## Como cadastrar livros

Use `js/books/book-registry.js` como catálogo e `js/books/book-config.js` como schema oficial.

Para disponibilizar um livro:

1. Adicione ou atualize a entrada em `rawBookRegistry.books`.
2. Defina `id`, `number`, `title`, `category`, `act`, `mood`, `status`, `pdf` e `cover`.
3. Use `status: "disponível"` para liberar acesso.
4. Mantenha `status: "em breve"` enquanto PDF e capa finais não estiverem prontos.
5. Valide o reader e a capa no navegador.

Exemplo mínimo:

```js
{
  id: "novo-livro",
  number: 3,
  title: "Novo Livro",
  category: "Iniciação / Tema",
  act: "Ato I · Limiar",
  mood: "Entrada",
  stage: "awakening",
  status: "disponível",
  readerRenderMode: "pdf",
  pdf: "livros/novo-livro/novo-livro.pdf",
  cover: "livros/capas do livros difinitivo/novo-livro.png",
  progress: 0,
}
```

Para detalhes adicionais do schema, consulte `js/books/README.md`.

## Analytics local

A camada de analytics funciona somente no navegador atual e não envia dados para serviços externos.

- Sessões: `localStorage["pseu.analytics.sessions.v1"]`
- Eventos: `localStorage["pseu.analytics.events.v1"]`
- ID da sessão atual: `sessionStorage["pseu.analytics.sessionId.v1"]`
- Eventos únicos da sessão: `sessionStorage["pseu.analytics.once.v1"]`

O módulo acompanha Chamado, Biblioteca, Travessia, VSLs, CTA final, entrada no portal, livros e continuidade do reader. O estágio máximo alcançado é salvo numa escala de 1 a 10.

Para consultar os sinais:

1. Rode o portal por HTTP.
2. Acesse `http://127.0.0.1:4173/admin-local.html`.
3. Use `Exportar dados` para baixar um JSON com sessões, eventos e resumo.

Limite de privacidade desta fase:

- Não coleta nome.
- Não coleta e-mail.
- Não coleta IP.
- Não integra backend, Google Analytics, pagamento ou serviços externos.

## Continuidade local

O Portal preserva silenciosamente a travessia do usuário em:

```text
localStorage["pseu.portal.continuity.v1"]
```

Essa memória local registra:

- Último estágio e estágio máximo do funil.
- Fragmentos tocados na biblioteca externa.
- Último VSL assistido.
- Ponto aproximado e progresso percentual dos dois VSLs.
- Estado de conclusão dos VSLs.

A leitura continua usando:

```text
localStorage["pseu.reader.state"]
```

Esse estado preserva último livro, página, progresso, histórico recente, favoritos e bookmarks.

Na interface:

- O Chamado exibe uma retomada discreta quando existe uma travessia anterior.
- Livros visitados e fragmentos lidos recebem presença visual sutil.
- VSLs incompletos exibem `Retomar` sem mostrar tempo bruto.
- Controles dos VSLs aparecem por interação e desaparecem suavemente.

## Troca futura de assets

- Capas continuam centralizadas em `js/books/book-registry.js`.
- Pôsteres ficam centralizados nos slots semânticos `window.PSEU_ASSET_SLOTS` de `js/funnel-config.js`.
- Para trocar assets oficiais, altere os caminhos cadastrados sem editar a lógica do portal.

## Atmosfera dinâmica

A camada cinematográfica fica isolada em `js/atmosphere.js` e não altera analytics, reader, biblioteca ou persistência.

Contextos atuais:

- `call`: Chamado frio, distante e silencioso.
- `library`: arquivo secreto com dourado discreto.
- `travessia`: roxo e preto contemplativos.
- `offer`: dourado amadurecido sem pressão visual.
- `portal`: atmosfera estável do sistema interno.

Elementos visuais leves:

- Névoa em duas camadas.
- Luz volumétrica discreta.
- Textura analógica.
- Partículas quase invisíveis.
- Presença indireta em sombra.
- Parallax limitado a um frame por interação.

Degradação automática:

- Desktop: atmosfera completa.
- Mobile ou ponteiro por toque: blur reduzido e partículas removidas.
- `prefers-reduced-motion` ou economia de dados: movimento mínimo e camadas opcionais removidas.

Estrutura futura disponível em `window.PSEU_ATMOSPHERE`:

```js
window.PSEU_ATMOSPHERE.registerTheme("book-theme", {
  "--ambient-a": "rgba(1, 2, 3, 0.12)",
});

window.PSEU_ATMOSPHERE.setLayerContext({
  bookId: "despertar",
  chapterId: "limiar",
  emotion: "contemplativo",
});
```

## Biblioteca cinematográfica

As bibliotecas externa e interna continuam usando o mesmo componente de livro. O refinamento visual permanece concentrado em `css/style.css`, sem criar uma segunda lógica de catálogo.

Camadas atuais:

- Arquivo ambiental discreto ao redor da coleção.
- Livros acessíveis com profundidade física, resposta suave ao mouse e resposta curta ao toque.
- Livros futuros preservados visualmente como arquivos selados, sem apagar sua presença.
- Estados visitado e fragmento lido mantidos como sinais sutis de continuidade.
- Microcopy dinâmica selecionada pelo histórico já existente em `js/main.js`.

Degradação automática:

- Hover detalhado somente em ponteiros precisos.
- Mobile reduz sombras, blur, perspectiva e intensidade dos brilhos.
- `prefers-reduced-motion` remove transformações decorativas.

Para trocar capas oficiais no futuro, mantenha os caminhos centralizados em `js/books/book-registry.js`. O refinamento não exige alteração na lógica dos livros.

## Transições de travessia

As etapas do pré-portal continuam sendo seções do mesmo documento. A navegação apenas ganhou uma passagem cinematográfica leve para evitar cortes secos.

Sequência atual:

- `Chamado -> Biblioteca`: fechamento escuro curto e arquivo surgindo em profundidade.
- `Biblioteca -> Travessia`: ambiente desce para roxo e preto antes do VSL principal aparecer.
- `Travessia -> Oferta`: o contexto `offer` amadurece o dourado quando o bloco final entra em cena.
- `Pré-portal -> Portal interno`: fechamento um pouco mais profundo e reabertura calma do sistema interno.

Implementação:

- Marcação mínima da passagem em `index.html`.
- Controlador de navegação em `js/main.js`.
- Contexto visível da oferta em `js/atmosphere.js`.
- Camada visual, microinterações e degradação progressiva em `css/style.css`.

Performance:

- Sem animação JavaScript contínua.
- Mobile usa tempos menores e menos blur.
- Perfil mínimo mantém somente fade simples.
- `prefers-reduced-motion` remove transformações decorativas.

## Portal interno premium

O Portal interno continua usando a arquitetura existente, mas sua superfície visual passa a comunicar um sistema reservado em vez de uma área de membros comum.

Refinamentos atuais:

- Entrada com estabilização gradual depois da travessia.
- Topbar silenciosa com estado de acesso reconhecido.
- Sidebar menos parecida com navegação de app e mais próxima de um arquivo privado.
- Profundidade espacial interna com planos leves e degradáveis.
- Destaque elegante para retomada quando existe histórico local.
- Abertura visual do reader como entrada em arquivo reservado.

Memória visual:

- A faixa `Ecos preservados` usa somente `lastOpenedBooks` já salvo no estado do reader.
- Até três livros acessíveis recentes reaparecem discretamente.
- Livros selados não são projetados nessa faixa.
- Cada eco reutiliza o índice normal do catálogo e abre o livro pelo fluxo já validado.
- Nenhum novo dado pessoal ou armazenamento foi adicionado.

Performance:

- Desktop completo recebe respiração atmosférica interna muito lenta.
- Mobile remove essa respiração, reduz sombras e exibe ecos em uma coluna.
- Perfil mínimo remove planos ornamentais internos.
- `prefers-reduced-motion` remove animações decorativas.

## Entrada cinematográfica

A Página 1 continua sendo o estágio `Chamado`, mas sua composição visual foi isolada para funcionar como uma cena de abertura em vez de um hero convencional.

Camadas atuais:

- Presença noir periférica reaproveitada do export local `Design sem nome.png`.
- Portal em profundidade usando `PCL/assets/images/visuals/portal-entry-16x9.svg`.
- Fumaça discreta reutilizando `PCL/assets/images/visuals/smoke-overlay.svg`.
- Luz volumétrica leve, moldura interna, textura ambiental e sinal mínimo de presença.
- Manifesto principal com hierarquia editorial e CTA silencioso `Atravessar`.
- Reação visual específica durante a passagem `Chamado -> Biblioteca`.

Preservado:

- Os mesmos ganchos `data-nav` de navegação.
- O sussurro local de continuidade.
- Tracking, persistência, reader, VSLs, biblioteca, desbloqueio e painel administrativo.

Performance:

- Nenhuma dependência, imagem nova ou rotina JavaScript contínua.
- Movimento restrito a `opacity` e `transform` em camadas decorativas.
- Mobile reduz presença, fumaça e iluminação.
- Perfil mínimo remove portal, fumaça e luz opcional.
- `prefers-reduced-motion` desativa animações decorativas.

## Lapidação visual da travessia

A direção visual do Canva foi traduzida com mais fidelidade para a entrada e para a passagem entre etapas, sem criar sistemas ou alterar a mecânica existente.

Refinamentos atuais:

- Moldura da Página 1 reduzida para evitar aparência de card ou painel.
- Manifesto dividido em respirações editoriais controladas.
- Topo simplificado para remover linguagem excessivamente técnica.
- Silhueta PSEU integrada por máscara orgânica, menor opacidade e posicionamento periférico.
- Fumaça e luz mais lentas, difusas e degradáveis.
- Véu de transição refinado como dissolução de planos com fumaça sutil.
- Entrada da Biblioteca e da Travessia coordenada por fades editoriais leves.
- Bloco intermediário da Travessia tratado como pausa narrativa em vez de card comum.

Preservado:

- Navegação, tracking, persistência, VSLs e controles.
- Biblioteca, reader, desbloqueio, painel administrativo e lógica interna.
- Assets já existentes, sem adicionar imagens ou vídeos pesados.

Performance:

- Nenhuma rotina JavaScript contínua adicionada.
- Mobile reduz silhueta, fumaça, luz e intensidade do véu.
- Perfil reduzido pausa a respiração da luz.
- Perfil mínimo remove planos opcionais.
- `prefers-reduced-motion` desativa movimentos decorativos.

## Acabamento global do universo

Uma rodada longa de direção de arte foi aplicada como camada final de CSS, sem alterar marcação funcional ou lógica validada.

Princípios:

- Menos aparência de software e menos superfícies arredondadas.
- Mais ritmo editorial, silêncio e espaço negativo.
- Contrastes, glows e sombras reduzidos para preservar profundidade sem excesso.
- Componentes funcionais mantidos, porém visualmente integrados ao mesmo universo.

Superfícies refinadas:

- Biblioteca externa com arquivo mais seco e coleção menos parecida com catálogo.
- Travessia e oferta com VSLs integrados a uma sala escura, controles discretos e botão de play menos genérico.
- Portal interno com sidebar, topbar, indicadores e ecos mais silenciosos.
- Biblioteca interna com atos editoriais, livros mais materiais e arquivos selados menos parecidos com itens desabilitados.
- Reader com moldura quase invisível, HUD discreto e luz interna reduzida, sem alterar sua arquitetura.
- Mobile com respiro próprio, controles compactos e grade nativa de dois arquivos por linha.

Performance:

- Refinamento concentrado em CSS.
- Nenhuma nova imagem, dependência ou rotina JavaScript.
- Perfil reduzido e perfil mínimo removem animações e planos opcionais.
- `prefers-reduced-motion` mantém a experiência estável sem respirações decorativas.

## Direção editorial vertical

O pré-portal foi reconstruído como uma travessia editorial contínua. A Página 1 deixa de funcionar como hero isolado; Biblioteca e Travessia passam a ser capítulos do mesmo filme vertical.

- `#funil-chamado`: abertura cinematográfica com maior ocupação vertical e espaço negativo.
- `#funil-biblioteca`: prólogo, pausa editorial, coleção viva, manifesto e descida narrativa.
- `[data-funnel-books]`: mantém a renderização dinâmica dos 18 livros, mas agora dentro de uma constelação editorial assimétrica.
- `#funil-travessia`: recebe o usuário como continuação da coleção, sem quebra visual brusca.
- `.vsl-prologue`: introduz o VSL principal como consequência da narrativa, não como bloco de conversão isolado.

No mobile, a composição não replica simplesmente o desktop: a leitura vertical ganha ritmo próprio, os manifestos respiram em uma coluna e os arquivos mais importantes ocupam mais presença quando necessário.

Toda a reconstrução permanece concentrada em `index.html` e `css/style.css`. Analytics, tracking, persistência, vídeos, desbloqueio, reader e `_BACKUP_CHECKPOINT/` continuam intactos.

## Referência oficial da Página 1

A abertura do Chamado foi realinhada à composição oficial criada manualmente no Canva. Ela não funciona como hero tradicional: a entrada ocupa uma sequência vertical contínua antes de entregar o usuário à Biblioteca.

Movimentos da abertura:

1. Presença: `Eu sou o PSEU. O portal começa aqui.`
2. Chave: a revelação de que a abertura está entre os 18 livros.
3. Travessia: `17 livros revelam o caminho`, seguida do CTA que conduz à Biblioteca.

O vídeo atmosférico oficial fica em:

```text
arsenal visual PSEU/2025-11-16T14-42-54_dark_cinematic.mp4
```

Ele é carregado silenciosamente na primeira cena com `autoplay`, `muted`, `loop` e `playsinline`. O arquivo `Design sem nome.png` permanece como pôster e fallback visual. Em perfis mínimos e em `prefers-reduced-motion`, o vídeo desaparece e a composição continua funcionando com a imagem estática.

## Referência oficial da Página 2

A Biblioteca externa foi realinhada à composição editorial oficial. A âncora `[data-funnel-books]` continua renderizando os 18 livros normalmente, mas deixa de ser percebida como catálogo: os arquivos agora atravessam uma narrativa vertical assimétrica.

Estrutura da travessia:

- missão editorial antes dos livros;
- arquivos tratados como fragmentos físicos, com estados visitados e selados preservados;
- pausas narrativas depois dos arquivos `03`, `08`, `13` e `17`;
- fumaça, luz e presença invadindo livros e manifestos;
- arquivo `18` ampliado como encontro com a chave;
- descida orgânica para a Travessia e o VSL principal.

Os interlúdios são inseridos em `renderFunnelSection()` somente como marcação editorial. Botões, capas, estados, progresso, tracking, reader e desbloqueio continuam usando a lógica existente.

## Checkpoint

A pasta `_BACKUP_CHECKPOINT/` contém uma cópia dos arquivos principais, configurações e SVGs ativos do marco anterior à camada de analytics. Ela permanece intacta como ponto seguro de retorno. Os vídeos e PDFs grandes não são duplicados; seus caminhos e tamanhos ficam registrados no manifesto interno do checkpoint.

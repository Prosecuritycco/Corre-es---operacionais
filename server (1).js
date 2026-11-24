/* ==========================================================================
   SERVIDOR CENTRAL — Controle de Correções Operacionais PROSECURITY
   Sem dependências: só precisa do Node.js (versão 16 ou mais nova).
   - Serve o sistema (index.html, script.js, style.css, assets/) e a API /api/*
   - Guarda TODOS os dados em ./dados/dados.json (com cópias de segurança automáticas)
   - Confere login e senha AQUI (no servidor) e aplica as permissões de cada perfil em cada operação
   Como usar: veja LEIAME_SERVIDOR.md
   ========================================================================== */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');

const PORTA = Number(process.env.PORT) || 3000;
const RAIZ = __dirname;
const DIR_DADOS = process.env.DADOS_DIR || path.join(RAIZ, 'dados');
const ARQ = path.join(DIR_DADOS, 'dados.json');
const VERSAO = '3.2.0';
const DIR_ANEXOS = path.join(DIR_DADOS, 'anexos');
const ANEXO_MAX = 10 * 1024 * 1024, ANEXOS_POR_CORRECAO = 5;
const SESSAO_HORAS = 12, MAX_TENTATIVAS = 5, BLOQUEIO_MIN = 5, HASH_RODADAS = 20000;

/* ---------------- Perfis e permissões (mesma matriz do script.js — mantenha as duas iguais) ---------------- */
const PERFIS = { MESTRE: 'Acesso completo e administração dos acessos', CCO: 'Visualização e tratativa das solicitações + Dashboard', SUPERVISOR: 'Criação e acompanhamento das próprias solicitações', GERENTE: 'Gerente operacional: consulta das solicitações da(s) sua(s) área(s), sem editar' };
const PERMISSOES = {
  MESTRE: ['dashboard', 'indicadores', 'correcao.criar', 'correcao.ver', 'correcao.ver.todas', 'correcao.editar', 'correcao.status', 'correcao.excluir', 'historico.ver', 'exportar', 'usuarios.admin', 'backup'],
  CCO: ['dashboard', 'indicadores', 'correcao.ver', 'correcao.ver.todas', 'correcao.status', 'historico.ver', 'exportar'],
  SUPERVISOR: ['correcao.criar', 'correcao.ver', 'correcao.editar.proprias'],
  GERENTE: ['correcao.ver']      // somente leitura; quem tem areasCriar (ex.: MULTIRÃO) também pode solicitar nessas áreas
};
const STATUS_EDITAVEL_SUPERVISOR = ['PENDENTE', 'AGUARDANDO INFORMAÇÃO', 'DUPLICIDADE / VALIDAR'];
const CAMPOS_STATUS = ['status', 'responsavel', 'correcaoRealizada', 'corrigidoPor', 'concluidoEm'];
const CAMPOS_FIXOS = ['id', 'data', 'criadoEm', 'criadoPor', 'criadoLogin', 'criadoPerfil', 'solicitante'];
const dataLocal = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const CAMPOS_META = ['atualizadoEm', 'atualizadoPor'];

/* Contas iniciais (só sal + hash; as senhas não ficam no código). Preenchido pelo build. */
const SEED_USUARIOS = [
  { login: 'MESTRE', perfil: 'MESTRE', sal: 'eeb320998a8bffcb11a96561d5c50335', hash: '3682629749298131aa63d94f88e5259a054f8ac1924d43ef86a23ac3a0d9d701' },
  { login: 'SUPERVISOR', perfil: 'SUPERVISOR', sal: 'b8ec01a6cab91834de4133cde09e273d', hash: 'fc327b67abe338670a18ea15561074fe9a28bfc4ee61c1505920b96fd7641d67' },
  { login: 'CCO', perfil: 'CCO', sal: 'ee4782ab00df6740f2b9db8904be2d0f', hash: 'd4e3bef78e10eaf23ebf981cd83ef0469b56cf02ba0c3e6d5b7b2b4a9a66aafd' }
];

/* Contas individuais de SUPERVISOR (35). São criadas UMA vez, na primeira inicialização desta versão (3.1); só sal + hash, a senha inicial não fica no código.
   Todas entram marcadas como SENHA INICIAL; o MESTRE pode redefinir em "Usuários e acessos". */
const SEED_V32 = [{"login":"GILSON.SANTOS","perfil":"MESTRE","sal":"dc24d0fbbff185e9c15abdd12053c921","hash":"293b06ea5c11471de2aa48df65a428d52b00a39e2470a8c85d630f95fe7af700"},{"login":"DIOGO.PESSOA","perfil":"MESTRE","sal":"b614e420cdf7607a750ab5fe0df359df","hash":"dd53d0e6219caf4781ec99d81dbdc59369747ef3871088bb90d11abf565d20d5"},{"login":"RAPHAEL.XAVIER","perfil":"CCO","sal":"d267003978cff09fec8b1a2e13502af1","hash":"62a71d6d839902c27f6b633a329a44e8b5e48d6bf33c756d296eb84d2691b5d8"},{"login":"LUCIANO.SILVA","perfil":"CCO","sal":"4342126522080826b3a74392288eb029","hash":"41dd402129506c3cf2e1fe65b96a51c45dc1d9487b23c773df7d442c96deb93e"},{"login":"ERICK.BEZERRA","perfil":"CCO","sal":"1a340384bd3ec7f8b65980df77a13eb1","hash":"5a80950815e4c74f3f3b0d69dfda67fbbf45a540bd6e06aca554439c0cc16d3f"},{"login":"LUCAS.RIBEIRO","perfil":"CCO","sal":"f9820520b70a24b324c94829b18c7dae","hash":"4d3fa943a5b3dd359b0303c77256391368b153c26c659d18f1110e10e5b1657e"},{"login":"VINICIUS.GENIAL","perfil":"CCO","sal":"1c9be2a0f3fa2cc3c6ca7f9c0fcf58fe","hash":"e73eacdc426784d3578a7a1cb1c306f8dcee3e243605a5e4eb110d4bc3750c50"},{"login":"LUCAS.ALVES","perfil":"CCO","sal":"459bddd3c1ff98a44769aab4d4687048","hash":"c81cd23b7c1a6ba84020ae0d63a3110259cda3caf6c39bab24da4b552534da2f"},{"login":"ALEXANDRE.JUSTINO","perfil":"CCO","sal":"4d8b8bad8ac2171272504d9734521691","hash":"452f8e3ae955e8c454d344f250eb5a5661a9ae53874baab181070834dbdc67a8"},{"login":"ANDRE.SANTOS","perfil":"GERENTE","sal":"e4e7a266d9fc50b5d4b02f381c964d04","hash":"f7ca063d749af9580f48541c8cc4945551843e68f697e3613cde748a016251d2","areas":["BRAVO"]},{"login":"ACORREIA","perfil":"GERENTE","sal":"9758d66429fdbf18d3054f42a69b9abd","hash":"e2db175fc7286d5f5fed469cf88f139efdcef41d91616b0275f306ccb0bc74c5","areas":["CHARLIE"]},{"login":"ANDERSON.MOREIRA","perfil":"GERENTE","sal":"968c7bc8a1aeb3d313d9b0b674f9ea31","hash":"073bb71de4b150f7118674a9201983efb851e8b312efc757ef8fde317c755581","areas":["DELTA"]},{"login":"REGINALDO.LIRA","perfil":"GERENTE","sal":"c044a5fa7ce8345a5c03de6d0bdc32e4","hash":"8cde8a20de7cb8bf71f374aba9dea84cf3c77aecf3456050d01de0540ae8e481","areas":["ECO"]},{"login":"JOSIELIA.SOUZA","perfil":"GERENTE","sal":"09677b45193f46cc3a8aedf1e8316793","hash":"17c4dff84b1c88eda9e3c2b28ec437bab9f06bb545b18f9d888f56c8da2b7a42","areas":["SIERRA","PAPA"]},{"login":"JEFFERSON.ANJOS","perfil":"GERENTE","sal":"d905bae89328b2b937a6a3e0157d0a59","hash":"10e88e5a088bff480f92eb3561373981e98dc127221aae42421900859a8ac53c","areas":["SIERRA","PAPA","MULTIRÃO"],"areasCriar":["MULTIRÃO"]},{"login":"EDILSON.SILVA","perfil":"GERENTE","sal":"4a2816ded3484fd4a2e3c2d12367eda6","hash":"b05900579603b1839dc6055e60192b579eb21f775f9a9b523712acc3948b4446","areas":["ALPHA"]},{"login":"DAMIAO.ALMEIDA","perfil":"GERENTE","sal":"206f9f06bb39a9ec13b7c6d896b72a01","hash":"55565e4d71bd1fc53527a7dcb8dad862d42a1a6dcfd58580cfa8f3245eb23a50","areas":["ALPHA"]},{"login":"ROBSON.TAKEDA","perfil":"GERENTE","sal":"737b1fd25864f865abd5f9b207f0d42b","hash":"73a071a656f16a241bedd51b47e5d1d5107acfa9515c499660bb06f12e71d404","areas":["LIMA","GSI"]},{"login":"LUANA.SANTANA","perfil":"SUPERVISOR","sal":"697d82dc9a695cb99a097730b690b57b","hash":"ed6153f9cb6854bfdcdf1ed5112a342b4f27f48b5d85360eb82c6cce891c5f73"},{"login":"ADRIANA.GOMES","perfil":"SUPERVISOR","sal":"4a81806d6a22724336d5ba2034e07a42","hash":"7da2d6b32c9c53ed8b67570869689b86a6dc225f783df71861797e822afc0bb0"},{"login":"ALISSON.LIMA","perfil":"SUPERVISOR","sal":"4ec84089c6befd1609382b0f805119ad","hash":"16ef3562e9e1e79fa1a06c7e529650bd128b16bfbf07e0726ab8fc844a3ab031"},{"login":"FELIPE.SOUSA","perfil":"SUPERVISOR","sal":"2706e8fe3e26243a60015e8952551225","hash":"20f61155e497c93f26dbf4a96029e9d65e02893a65e6f624c3be8983a37c5120"},{"login":"DOUGLAS.PEDRO","perfil":"SUPERVISOR","sal":"004abe12d0b26d739c86888b8d76c5e5","hash":"3e478158c163c0ebf2ccf757f16235b2e76e555fe50e3088789eea696617cf5d"},{"login":"JARDENILSON.LIMA","perfil":"SUPERVISOR","sal":"34c6c032986a78dcb3e53b84ef4c28f4","hash":"808b13d4712e5f00eff2bfaa908b72f03bc0e1fb03ca630cf8d6df32ff89f2a6"}];
const SEED_SUPERVISORES = [{"login":"WELLINGTONSOUSA","sal":"b981b8fad390b832ceed2e9401f37127","hash":"7c1961dfdbc5b1c46cd95e203d095fe920f51c26ece879d5c467a34b53f5e650"},{"login":"FABIANOBALEEIRO","sal":"0cdac1ea8ac6c04082a7cb462dbb735b","hash":"340868ac0bb9d163da9e2e9dc7241bce79286be98cc553acefe2db6091860a4d"},{"login":"GILMARALMEIDA","sal":"6904f0da2457f1362a4e47e87e607d48","hash":"ba2936d6a1d522de72ea9229e196460383be09b3e10e83b842f0f0c1517f69cf"},{"login":"RICARDOSILVA","sal":"50e1ea3fbf3634903c86f83867637ba2","hash":"066dc96a654ba2af19213438eb2a4db1782938841338e44d1b2b7571b7b40d29"},{"login":"RAPHAELFERREIRA","sal":"306fd09b8c626f1ae69da9825ded6520","hash":"990e8210aa1569e60f7f2ca2e0e33096e46eb50de16e0e34f0864419b95aa3bf"},{"login":"JOSELMOBEZERRA","sal":"6411e998072f7cc40156610d6daae03a","hash":"fa44595b226ec2061e278fa6a2aed069c9ff826a93dfc32993adf09325de1405"},{"login":"MARCELLOAMORIM","sal":"cf60cf659c350ebd5b374b1a1e715de6","hash":"555434a334dadafc0d913a247d4a712174a38a0065f53cf2f45df96d87d7e42d"},{"login":"EDILSONCELESTINO","sal":"bd57e698a5f670f87afa731f0d66fff4","hash":"cfb10e6ae1021d3354e3d7cf67d18e771ae833a6987dc2a60ba69fa11f2bbe6d"},{"login":"JORGEMELO","sal":"9ee4c30c7edb1e9e58245870fde238c8","hash":"0967a6c574f4209d3f1f825e232fdccd9fe9ee7a7cd15c8887eab3fed3a32dd5"},{"login":"ANTONIORODRIGUES","sal":"785591446ccd37592ef62e4fe7595d92","hash":"7dfa202313c5ec7dc4927073e03b73b70f0daa6eeefb73b951a9ca928dd1cabe"},{"login":"ADRIANOOLIVEIRA","sal":"ed8ddb6082de69bb60e8a53bc5a85faf","hash":"5ec7899d4af9003dcc180677b82934c777d341209b36b839d0a54ea5fcb31744"},{"login":"DEUSDEDITHSOUZA","sal":"fac38c60ab8c815210955766f0fa8c62","hash":"531eb1a6564fa366fef49e16d78229e7e8531d114c5e9071da50b866b9a2a158"},{"login":"JOSESOUZA","sal":"0388ce2f7d910b09ec893b34e78cc9b6","hash":"d7426ee5a9fc56c486727765cf7b765f125838736d24525a79bea037df649b6c"},{"login":"CLEYTONSOUZA","sal":"51629800240c810d91e4f3d4d9c99647","hash":"f7c0387cf688848b1450c7ee9765cfbcd6205526a8de7c876a0180678bf1e382"},{"login":"LUCIANOSOUSA","sal":"ef6b3fb81413bdd1d4f3ab8b53c12f84","hash":"cd3386b0d45c11a0f1a6bcbc274ee4e28dd76a675e764eb20a9408a302194cf7"},{"login":"JOSIMARPRADO","sal":"4c7c046beda687f29f30b8905e9f77e0","hash":"e35a3eb7beeb6c3877c94ac13e9801080c2dd86c1e39bc16b78e78c1fc04b604"},{"login":"MATHEUSSILVA","sal":"515f27993a84241fb71a71a243cbc942","hash":"a758dfde776060e412c5e1048956f5cb9c56ed640e4498e025d38c8ee3c8082d"},{"login":"GILMARXAVIER","sal":"58d000e8c8091a16f2c39cbdae6f8469","hash":"50b47d6c2aecf9b995b35d19d256babb7c1df912c5f48cadb4b522b67d03a005"},{"login":"MARCELOLEONARDO","sal":"d5e3da7bf6875cbf7b71a59095921a0a","hash":"fd7fc3ed327dc224b8fc0f073df5bb137f3ca8e2e016e10618329673f5fdb35d"},{"login":"GILSONGOMES","sal":"a333622fd4370b7c3bb9435673a76096","hash":"6956001981cdea270b67c1bcd52eceb8c63dbc3d37d09d4b2e1a2d0c58c7eec6"},{"login":"KELVINMOREIRA","sal":"f56ef411e1aed148b177319537625819","hash":"c421f292dca335570e20dc47f8d8a0bdf595a593c70c33c2161f5f2c13eef5ea"},{"login":"FRANCISCOJUNIOR","sal":"2beeee337b5a6d42f20a4aa5317d8a81","hash":"ee508a46f86558a646d17edeba8d6317c590a84f900563c12eaa2301cf0361f9"},{"login":"EVERTONBENTO","sal":"761a42ce3d87b0991b59f45a1eecaa79","hash":"eae4bafdff1dca8a9785c8ae35052e65186faf1a40e9df1e7f8db059a1a68ef0"},{"login":"NEILSONSILVA","sal":"208ff15db2cc5079ab186153130c957b","hash":"79e4d58846f1c3e637757c1ac8b820baf9b390d446ab9977b5b76d2024b07943"},{"login":"CHRISTIANOLIMA","sal":"6f5184d89e4c5da01ff7577b70cca693","hash":"01fd2885701128a5ba6a0178943006a57ebd47e1b773974a5e71aad4265db67d"},{"login":"EDERSONSOUZA","sal":"db9410906971a87508459db93f441a51","hash":"d2c505215c8e32586348c22159f899fb165c3015af2a885468890cbf098899c2"},{"login":"DALILASILVA","sal":"6170ff05e1c403c7205ffd9ed078848b","hash":"6226dc255b8444f60c5c0156b286527abf58a1b063ea35e553feb740e8dd7b02"},{"login":"ANDERSONCONTI","sal":"9af0f228ab0ee08476a70a7d6e13399d","hash":"473a0a6932493bda5996b4a728cdeca5d1dbc649d6a824710dca3a1da9503756"},{"login":"MARCIAPEDROSO","sal":"1849f52e3912f733531fb9467016938b","hash":"e53c410883cad8688af43333fc4e952019204969fd8f9aa284393a184e44821d"},{"login":"JEOZADAQUEGONCALVES","sal":"e9bf6ad4a465277f6783f27cf9edf3a6","hash":"b85aff967d4210f985bd0664476ab03630212afc2670fa90d93673fb90bcd0d1"},{"login":"JORGEFLAUZINO","sal":"5631d82562dd801643469ef6eabce48e","hash":"17f93c5466972a37f1142e2492b0cce17b9a00e6b87d3de99274693d1f21ec1d"},{"login":"SAMARAARAUJO","sal":"02527b77c01f14aed61f0e87cb863715","hash":"821c2fef290479d78ec9d96edf89df201025671228c5a97b1b40705f8249e913"},{"login":"RODRIGOCANDIDO","sal":"d5fa4f62a8fcf7411dc3b83cb6f8cdc3","hash":"19c8a49ce7ee9a33dc328d66f3ba7e751feed416a8003093dbf39ce68fd02491"},{"login":"GENIVALCUNHA","sal":"410a317fd6be390e577c10f96df2b238","hash":"99c93a7918d2281fed2663bdf3524d6b9756934abcb9c989284339effb3d1e92"},{"login":"KELLYSAMPAIO","sal":"8d35809dbf2b77f3911238d22768f72d","hash":"59802b7cebf1c439e022a3a1059a8ba883e1126944b685ad432a76c49ef64d03"}];

/* ---------------- Armazenamento na nuvem (opcional: Supabase, plano gratuito) ----------------
   Só liga se SUPABASE_URL e SUPABASE_KEY estiverem definidas. Guarda os dados (tabela app_dados) e os anexos (bucket "anexos")
   fora do servidor, para nada se perder quando a hospedagem gratuita reinicia. Sem essas variáveis, tudo funciona como antes (pasta dados/). */
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, ''), SB_KEY = process.env.SUPABASE_KEY || '';
const NUVEM = !!(SB_URL && SB_KEY);
const sbH = (extra = {}) => (SB_KEY.startsWith('sb_') ? { apikey: SB_KEY, ...extra } : { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, ...extra });   // chaves novas (sb_secret_...) vão só no apikey; as antigas (JWT) também em Authorization
async function nuvemCarregar() {
  const r = await fetch(SB_URL + '/rest/v1/app_dados?id=eq.1&select=dados', { headers: sbH() });
  if (!r.ok) throw new Error('Supabase (ler dados): HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const l = await r.json(); return l.length ? l[0].dados : null;
}
let nuvemOcupada = false, nuvemPendente = false;
async function nuvemSalvar() {
  if (nuvemOcupada) { nuvemPendente = true; return; }
  nuvemOcupada = true;
  try {
    do {
      nuvemPendente = false;
      const r = await fetch(SB_URL + '/rest/v1/app_dados?on_conflict=id', { method: 'POST', headers: sbH({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ id: 1, dados: D, atualizado_em: agoraISO() }) });
      if (!r.ok) console.error('Falha ao salvar na nuvem: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
    } while (nuvemPendente);
  } catch (e) { console.error('Falha ao salvar na nuvem:', e.message); }
  nuvemOcupada = false;
}
async function nuvemGarantirBucket() {
  try { await fetch(SB_URL + '/storage/v1/bucket', { method: 'POST', headers: sbH({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id: 'anexos', name: 'anexos', public: false }) }); } catch (e) { /* já existe ou sem rede */ }
}
async function nuvemPutAnexo(id, bin) {
  const r = await fetch(SB_URL + '/storage/v1/object/anexos/' + id, { method: 'POST', headers: sbH({ 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }), body: bin });
  if (!r.ok) throw new Error('Supabase (anexo): HTTP ' + r.status);
}
async function nuvemGetAnexo(id) {
  const r = await fetch(SB_URL + '/storage/v1/object/anexos/' + id, { headers: sbH() });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

/* ---------------- Dados ---------------- */
let D = { correcoes: [], historico: [], usuarios: [], auditoria: [], anexos: [] };
function agoraISO() { return new Date().toISOString(); }
function carregar(dadosNuvem) {
  fs.mkdirSync(DIR_DADOS, { recursive: true }); fs.mkdirSync(DIR_ANEXOS, { recursive: true });
  if (NUVEM) { if (dadosNuvem) D = { ...D, ...dadosNuvem }; }
  else if (fs.existsSync(ARQ)) {
    try { D = { ...D, ...JSON.parse(fs.readFileSync(ARQ, 'utf8')) }; }
    catch (e) { console.error('ERRO ao ler ' + ARQ + ': ' + e.message + '\nO servidor NÃO vai iniciar para não sobrescrever seus dados. Restaure uma cópia da pasta dados/backups.'); process.exit(1); }
  }
  if (!D.usuarios.length) {
    const agora = agoraISO();
    D.usuarios = SEED_USUARIOS.map(u => ({ ...u, ativo: true, descricao: PERFIS[u.perfil], senhaPadrao: true, criadoEm: agora, criadoPor: 'Sistema (conta inicial)', atualizadoEm: agora, atualizadoPor: 'Sistema (conta inicial)' }));
    gravarAgora();
  }
  if (!D.supervisoresSeed31) {       // uma única vez: adiciona as contas individuais que ainda não existem (nada é apagado nem sobrescrito)
    const agora = agoraISO(), ja = new Set(D.usuarios.map(u => u.login)); let n = 0;
    for (const c of SEED_SUPERVISORES) if (!ja.has(c.login)) {
      D.usuarios.push({ login: c.login, perfil: 'SUPERVISOR', ativo: true, descricao: 'Supervisor (conta individual)', sal: c.sal, hash: c.hash, senhaPadrao: true, criadoEm: agora, criadoPor: 'Sistema (contas dos supervisores)', atualizadoEm: agora, atualizadoPor: 'Sistema (contas dos supervisores)' }); n++;
    }
    D.supervisoresSeed31 = true; gravarAgora(); console.log('Contas de supervisores criadas: ' + n);
  }
  if (!D.contasSeed32) {            // v3.2: MESTREs, CCO, gerentes e supervisores da GSI (uma única vez; contas que já existem não são tocadas)
    const agora = agoraISO(), ja = new Set(D.usuarios.map(u => u.login)); let n = 0;
    for (const c of SEED_V32) if (!ja.has(c.login)) {
      D.usuarios.push({ login: c.login, perfil: c.perfil, ativo: true, descricao: PERFIS[c.perfil], areas: c.areas, areasCriar: c.areasCriar, sal: c.sal, hash: c.hash, senhaPadrao: true, criadoEm: agora, criadoPor: 'Sistema (contas v3.2)', atualizadoEm: agora, atualizadoPor: 'Sistema (contas v3.2)' }); n++;
    }
    D.contasSeed32 = true; gravarAgora(); console.log('Contas v3.2 criadas: ' + n);
  }
}
let timerGravar = null;
function gravarAgora() {
  const tmp = ARQ + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(D)); fs.renameSync(tmp, ARQ);
  if (NUVEM) nuvemSalvar();
}
function agendarGravacao() { if (!timerGravar) timerGravar = setTimeout(() => { timerGravar = null; try { gravarAgora(); } catch (e) { console.error('Falha ao gravar:', e.message); } }, 300); }
function backup() {
  try {
    const dir = path.join(DIR_DADOS, 'backups'); fs.mkdirSync(dir, { recursive: true });
    const d = new Date(), nome = `dados-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}.json`;
    if (!fs.existsSync(path.join(dir, nome)) && fs.existsSync(ARQ)) fs.copyFileSync(ARQ, path.join(dir, nome));
    const todos = fs.readdirSync(dir).filter(f => f.startsWith('dados-')).sort();
    todos.slice(0, Math.max(0, todos.length - 60)).forEach(f => fs.unlinkSync(path.join(dir, f)));
  } catch (e) { console.error('Falha no backup:', e.message); }
}

/* ---------------- Senha e sessão ---------------- */
function hashSenha(senha, sal) {
  const base = Buffer.from(sal + '|' + senha, 'utf8');
  let h = crypto.createHash('sha256').update(base).digest();
  for (let i = 1; i < HASH_RODADAS; i++) h = crypto.createHash('sha256').update(Buffer.concat([h, base])).digest();
  return h.toString('hex');
}
const iguais = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sessoes = new Map();       // token -> { login, criado }
const tentativas = new Map();    // login -> { n, ate }
const permsDe = u => { const b = PERMISSOES[u.perfil] || []; return (u.perfil === 'GERENTE' && Array.isArray(u.areasCriar) && u.areasCriar.length) ? b.concat(['correcao.criar', 'correcao.editar.proprias']) : b; };
const pode = (u, p) => !!u && u.ativo && permsDe(u).includes(p);
const podeCriarEm = (u, gestao) => u.perfil !== 'GERENTE' || (Array.isArray(u.areasCriar) && u.areasCriar.includes(gestao));
function usuarioDe(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || ''); if (!m) return null;
  const s = sessoes.get(m[1]); if (!s) return null;
  if (Date.now() - s.criado > SESSAO_HORAS * 3600e3) { sessoes.delete(m[1]); return null; }
  const u = D.usuarios.find(x => x.login === s.login);
  return u && u.ativo ? u : null;
}
const publico = ({ sal, hash, ...r }) => r;
function auditar(evento, login, perfil, detalhe, pessoa = '') {
  D.auditoria.push({ id: crypto.randomUUID(), dataHora: agoraISO(), login: login || '', perfil: perfil || '', pessoa, evento, detalhe: String(detalhe || '').slice(0, 300) });
  if (D.auditoria.length > 5000) D.auditoria.splice(0, D.auditoria.length - 5000);
  agendarGravacao();
}

/* ---------------- Regras de escopo e permissão ---------------- */
const visivel = (u, r) => pode(u, 'correcao.ver') && (pode(u, 'correcao.ver.todas') || r.criadoLogin === u.login || (u.perfil === 'GERENTE' && Array.isArray(u.areas) && u.areas.includes(r.gestao)));   // supervisor: só as próprias; gerente: as da(s) sua(s) área(s)
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
const valorIgual = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

/* Anexos: só referências a arquivos que existem no servidor; metadados vêm do servidor (não do navegador). */
function normalizarAnexos(u, rec, atual) {
  if (rec.anexos === undefined) { if (atual && atual.anexos) rec.anexos = atual.anexos; return ''; }
  if (!Array.isArray(rec.anexos) || rec.anexos.length > ANEXOS_POR_CORRECAO) return 'anexos inválidos (máximo ' + ANEXOS_POR_CORRECAO + ' por solicitação)';
  const ja = new Set(((atual && atual.anexos) || []).map(a => a.id)), out = [];
  for (const a of rec.anexos) {
    const m = a && /^[a-f0-9]{32}$/.test(String(a.id)) && D.anexos.find(x => x.id === a.id);
    if (!m) return 'ACESSO NEGADO: anexo inexistente';
    if (m.por !== u.login && !ja.has(m.id)) return 'ACESSO NEGADO: anexo de outro usuário';
    out.push({ id: m.id, nome: m.nome, tipo: m.tipo, tam: m.tam });
  }
  rec.anexos = out; return '';
}
function aplicarCorrecao(u, item) {
  const rec = item && item.rec;
  if (!rec || typeof rec.id !== 'string' || !/^[A-Za-z0-9._-]{3,60}$/.test(rec.id) || typeof rec.status !== 'string' || !ISO.test(String(rec.atualizadoEm || ''))) return 'registro inválido';
  const atual = D.correcoes.find(r => r.id === rec.id);
  const errAnexos = normalizarAnexos(u, rec, atual); if (errAnexos) return errAnexos;
  if (!atual) {
    if (!pode(u, 'correcao.criar')) return 'ACESSO NEGADO: sem permissão para criar';
    if (!podeCriarEm(u, rec.gestao)) return 'ACESSO NEGADO: você não pode solicitar nesta área';
    if (new Date(rec.criadoEm).getTime() > Date.now() + 10 * 60000) return 'Data/hora do computador inválida (futura)';
    if (rec.data !== dataLocal(rec.criadoEm)) return 'A data da solicitação deve ser a data em que ela foi criada';
    const novo = { ...rec, recebidoEm: agoraISO(), criadoLogin: u.login, criadoPerfil: u.perfil, demo: false };
    D.correcoes.push(novo); return '';
  }
  if (!visivel(u, atual)) return 'ACESSO NEGADO: registro fora do seu escopo';
  const chaves = new Set([...Object.keys(atual), ...Object.keys(rec)]);
  const mudou = [...chaves].filter(k => !CAMPOS_META.includes(k) && !['demo', 'criadoLogin', 'criadoPerfil', 'recebidoEm'].includes(k) && !valorIgual(atual[k], rec[k]));
  if (!mudou.length && rec.atualizadoEm === atual.atualizadoEm) return '';        // reenvio do mesmo registro (idempotente)
  if (item.base !== atual.atualizadoEm) return 'CONFLITO';
  if (mudou.some(k => CAMPOS_FIXOS.includes(k))) return 'ACESSO NEGADO: campos de origem não podem ser alterados';
  const mudouStatus = mudou.filter(k => CAMPOS_STATUS.includes(k)), mudouDados = mudou.filter(k => !CAMPOS_STATUS.includes(k));
  const podeEditar = pode(u, 'correcao.editar') || (pode(u, 'correcao.editar.proprias') && atual.criadoLogin === u.login && podeCriarEm(u, atual.gestao) && podeCriarEm(u, rec.gestao) && STATUS_EDITAVEL_SUPERVISOR.includes(atual.status));
  if (mudouDados.length && !podeEditar) return 'ACESSO NEGADO: sem permissão para editar';
  if (mudouStatus.length && !pode(u, 'correcao.status')) {
    // única exceção: o solicitante complementa a informação pedida e a solicitação volta para PENDENTE
    const ok = podeEditar && atual.status === 'AGUARDANDO INFORMAÇÃO' && rec.status === 'PENDENTE' && mudouStatus.length === 1;
    if (!ok) return 'ACESSO NEGADO: sem permissão para tratar/alterar status';
  }
  const idx = D.correcoes.indexOf(atual); D.correcoes[idx] = { ...rec, recebidoEm: atual.recebidoEm, criadoLogin: atual.criadoLogin, criadoPerfil: atual.criadoPerfil, demo: false };
  return '';
}
function aplicarHistorico(u, h) {
  if (!h || typeof h.id !== 'string' || typeof h.correcaoId !== 'string' || !ISO.test(String(h.dataHora || ''))) return 'evento inválido';
  if (D.historico.some(x => x.id === h.id)) return '';       // já recebido (reenvio)
  const r = D.correcoes.find(x => x.id === h.correcaoId);
  if (r ? !visivel(u, r) : !(h.acao === 'EXCLUSÃO' && pode(u, 'correcao.excluir'))) return 'ACESSO NEGADO: histórico fora do seu escopo';
  D.historico.push({ ...h, login: u.login, perfil: u.perfil }); return '';
}
function aplicarUsuarios(u, lista) {
  if (!pode(u, 'usuarios.admin')) return 'ACESSO NEGADO: administração de acessos';
  if (!Array.isArray(lista) || !lista.length) return 'lista inválida';
  for (const x of lista) if (!x || !/^[A-Z0-9_.-]{3,20}$/.test(x.login) || !PERFIS[x.perfil] || typeof x.ativo !== 'boolean' || !/^[a-f0-9]{32}$/.test(x.sal || '') || !/^[a-f0-9]{64}$/.test(x.hash || '')) return 'conta inválida';
  if (new Set(lista.map(x => x.login)).size !== lista.length) return 'logins repetidos';
  if (!lista.some(x => x.perfil === 'MESTRE' && x.ativo)) return 'é preciso manter ao menos uma conta MESTRE ativa';
  const antigos = new Map(D.usuarios.map(x => [x.login, x]));
  D.usuarios = lista.map(x => ({ login: x.login, perfil: x.perfil, areas: (antigos.get(x.login) || {}).areas, areasCriar: (antigos.get(x.login) || {}).areasCriar, ativo: x.ativo, descricao: String(x.descricao || '').slice(0, 80), sal: x.sal, hash: x.hash, senhaPadrao: !!x.senhaPadrao,
    criadoEm: x.criadoEm || agoraISO(), criadoPor: String(x.criadoPor || '').slice(0, 80), atualizadoEm: x.atualizadoEm || agoraISO(), atualizadoPor: String(x.atualizadoPor || '').slice(0, 80) }));
  return '';
}
function estadoPara(u) {
  const corr = D.correcoes.filter(r => visivel(u, r));
  let hist = D.historico;
  if (!pode(u, 'correcao.ver.todas')) { const ids = new Set(corr.map(r => r.id)); hist = hist.filter(h => ids.has(h.correcaoId)); }
  const adm = pode(u, 'usuarios.admin');
  return { correcoes: corr, historico: hist,
    usuarios: adm ? D.usuarios : D.usuarios.map(x => ({ login: x.login, perfil: x.perfil, ativo: x.ativo, areas: x.areas, areasCriar: x.areasCriar })),
    auditoria: adm ? D.auditoria.slice(-500) : [] };
}

/* ---------------- HTTP ---------------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const ESTATICOS = new Set(['index.html', 'script.js', 'style.css']);
function json(res, cod, obj) { const s = JSON.stringify(obj); res.writeHead(cod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); }
function corpo(req) {
  return new Promise((ok, err) => {
    const partes = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > 30e6) { err(new Error('corpo muito grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); } catch (e) { err(new Error('JSON inválido')); } });
    req.on('error', err);
  });
}
async function baixarAnexo(req, res, rota) {
  const u = usuarioDe(req); if (!u) return json(res, 401, { ok: false, erro: 'sessão inválida ou expirada' });
  const id = rota.slice('/api/anexo/'.length), m = /^[a-f0-9]{32}$/.test(id) && D.anexos.find(x => x.id === id);
  let cache = null;
  if (m && !fs.existsSync(path.join(DIR_ANEXOS, id)) && NUVEM) cache = await nuvemGetAnexo(id).catch(() => null);
  if (!m || (!cache && !fs.existsSync(path.join(DIR_ANEXOS, id)))) return json(res, 404, { ok: false, erro: 'arquivo não encontrado' });
  const liberado = m.por === u.login || D.correcoes.some(r => visivel(u, r) && (r.anexos || []).some(a => a.id === id));
  if (!liberado) { auditar('ACESSO_NEGADO', u.login, u.perfil, 'Tentativa de baixar anexo ' + id); return json(res, 403, { ok: false, erro: 'ACESSO NEGADO: anexo fora do seu escopo' }); }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': m.tam, 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(m.nome), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  if (cache) return res.end(cache);
  fs.createReadStream(path.join(DIR_ANEXOS, id)).pipe(res);
}
const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), rota = url.pathname;
    if (rota.startsWith('/api/')) {
      if (req.method === 'GET' && rota === '/api/ping') return json(res, 200, { ok: true, servidor: 'prosecurity-correcoes', versao: VERSAO, agora: agoraISO() });
      if (req.method === 'GET' && rota.startsWith('/api/anexo/')) return baixarAnexo(req, res, rota);
      if (req.method !== 'POST') return json(res, 405, { ok: false, erro: 'método não permitido' });
      const b = await corpo(req);
      if (rota === '/api/login') {
        const login = String(b.login || '').trim().toUpperCase().slice(0, 30), senha = String(b.senha || '').slice(0, 200);
        const t = tentativas.get(login) || { n: 0, ate: 0 };
        if (t.ate > Date.now()) return json(res, 429, { ok: false, erro: `Acesso temporariamente bloqueado por excesso de tentativas. Tente novamente em ${Math.ceil((t.ate - Date.now()) / 60000)} min.` });
        const u = D.usuarios.find(x => x.login === login);
        const h = hashSenha(senha, u ? u.sal : '0'.repeat(32));
        if (!(u && u.ativo && iguais(h, u.hash))) {
          t.n += 1; if (t.n >= MAX_TENTATIVAS) { t.ate = Date.now() + BLOQUEIO_MIN * 60000; t.n = 0; }
          tentativas.set(login, t); auditar('LOGIN_FALHA', login, '', u && !u.ativo ? 'Conta desativada' : 'Login ou senha inválidos');
          return json(res, 401, { ok: false, erro: 'Login ou senha inválidos, ou conta desativada.' });
        }
        tentativas.delete(login);
        const token = crypto.randomBytes(32).toString('hex'); sessoes.set(token, { login, criado: Date.now() });
        auditar('LOGIN', u.login, u.perfil, 'Acesso realizado');
        return json(res, 200, { ok: true, token, usuario: publico(u) });
      }
      const u = usuarioDe(req);
      if (!u) return json(res, 401, { ok: false, erro: 'sessão inválida ou expirada' });
      if (rota === '/api/logout') { const m = /Bearer (\S+)/.exec(req.headers.authorization || ''); if (m) sessoes.delete(m[1]); auditar('LOGOUT', u.login, u.perfil, ''); return json(res, 200, { ok: true }); }
      if (rota === '/api/anexo') {
        if (!(pode(u, 'correcao.criar') || pode(u, 'correcao.editar') || pode(u, 'correcao.editar.proprias'))) { auditar('ACESSO_NEGADO', u.login, u.perfil, 'Tentativa de enviar anexo'); return json(res, 403, { ok: false, erro: 'ACESSO NEGADO: sem permissão para anexar arquivos' }); }
        const nome = String(b.nome || 'arquivo').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'arquivo';
        if (typeof b.dados !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.dados)) return json(res, 400, { ok: false, erro: 'arquivo inválido' });
        const bin = Buffer.from(b.dados, 'base64');
        if (!bin.length) return json(res, 400, { ok: false, erro: 'arquivo vazio' });
        if (bin.length > ANEXO_MAX) return json(res, 413, { ok: false, erro: 'arquivo maior que ' + (ANEXO_MAX / 1048576) + ' MB' });
        const id = crypto.randomBytes(16).toString('hex');
        fs.mkdirSync(DIR_ANEXOS, { recursive: true }); fs.writeFileSync(path.join(DIR_ANEXOS, id), bin);
        if (NUVEM) { try { await nuvemPutAnexo(id, bin); } catch (e) { return json(res, 502, { ok: false, erro: 'não consegui guardar o anexo na nuvem' }); } }
        const meta = { id, nome, tipo: String(b.tipo || '').slice(0, 100), tam: bin.length, por: u.login, em: agoraISO() };
        D.anexos.push(meta); auditar('ANEXO', u.login, u.perfil, nome + ' (' + bin.length + ' bytes)'); agendarGravacao();
        return json(res, 200, { ok: true, anexo: { id, nome: meta.nome, tipo: meta.tipo, tam: meta.tam } });
      }
      if (rota === '/api/sync') {
        const rej = [], aceitos = { correcoes: [], historico: [], exclusoes: [] };
        for (const it of (Array.isArray(b.correcoes) ? b.correcoes : [])) { const m = aplicarCorrecao(u, it); if (m) { rej.push({ tipo: 'correcao', id: it && it.rec && it.rec.id, motivo: m }); if (m.startsWith('ACESSO NEGADO')) auditar('ACESSO_NEGADO', u.login, u.perfil, `${m} (${it.rec && it.rec.id})`); } else aceitos.correcoes.push(it.rec.id); }
        for (const h of (Array.isArray(b.historico) ? b.historico : [])) { const m = aplicarHistorico(u, h); if (m) rej.push({ tipo: 'historico', id: h && h.id, motivo: m }); else aceitos.historico.push(h.id); }
        for (const id of (Array.isArray(b.exclusoes) ? b.exclusoes : [])) {
          const r = D.correcoes.find(x => x.id === id);
          if (!r) { aceitos.exclusoes.push(id); continue; }
          if (!pode(u, 'correcao.excluir') || !visivel(u, r)) { rej.push({ tipo: 'exclusao', id, motivo: 'ACESSO NEGADO: exclusão' }); auditar('ACESSO_NEGADO', u.login, u.perfil, 'Tentativa de excluir ' + id); continue; }
          D.correcoes = D.correcoes.filter(x => x.id !== id); aceitos.exclusoes.push(id);
        }
        if (Array.isArray(b.usuarios)) { const m = aplicarUsuarios(u, b.usuarios); if (m) rej.push({ tipo: 'usuarios', id: '', motivo: m }); else aceitos.usuarios = true; }
        for (const a of (Array.isArray(b.auditoria) ? b.auditoria : []).slice(0, 200)) {
          if (!a || ['LOGIN', 'LOGIN_FALHA', 'LOGOUT'].includes(a.evento)) continue;
          D.auditoria.push({ id: String(a.id || crypto.randomUUID()).slice(0, 60), dataHora: ISO.test(String(a.dataHora)) ? a.dataHora : agoraISO(), login: u.login, perfil: u.perfil, pessoa: String(a.pessoa || '').slice(0, 80), evento: String(a.evento || '').slice(0, 40), detalhe: String(a.detalhe || '').slice(0, 300) });
        }
        agendarGravacao();
        return json(res, 200, { ok: true, aceitos, rejeitados: rej, estado: estadoPara(u), agora: agoraISO() });
      }
      return json(res, 404, { ok: false, erro: 'rota inexistente' });
    }
    // arquivos do sistema (somente a lista permitida)
    let nome = decodeURIComponent(rota === '/' ? '/index.html' : rota).replace(/^\/+/, '');
    const permitido = ESTATICOS.has(nome) || /^assets\/[A-Za-z0-9._-]+$/.test(nome);
    const arq = path.join(RAIZ, nome);
    if (!permitido || !arq.startsWith(RAIZ) || !fs.existsSync(arq)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(arq).pipe(res);
  } catch (e) { json(res, 400, { ok: false, erro: e.message }); }
});

(async () => {
  let dn = null;
  if (NUVEM) {
    try { await nuvemGarantirBucket(); dn = await nuvemCarregar(); console.log(dn ? 'Dados carregados da nuvem.' : 'Nuvem vazia: iniciando do zero.'); }
    catch (e) { console.error('ERRO: não consegui acessar a nuvem (' + e.message + ').\nO servidor NÃO vai iniciar para não apagar seus dados. Confira SUPABASE_URL, SUPABASE_KEY e a tabela app_dados.'); process.exit(1); }
  }
  carregar(dn); backup(); setInterval(backup, 3600e3);
  iniciarServidor();
})();
function iniciarServidor() {
servidor.listen(PORTA, '0.0.0.0', () => {
  console.log('\n=== Controle de Correções Operacionais — PROSECURITY (servidor ' + VERSAO + ') ===');
  console.log('Endereço para todos os usuários da rede (Wi-Fi/cabo da empresa):');
  Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).forEach(i => console.log('   http://' + i.address + ':' + PORTA));
  console.log('Neste computador:  http://localhost:' + PORTA);
  console.log(NUVEM ? 'Dados e anexos guardados na NUVEM (Supabase).' : 'Dados gravados em: ' + ARQ + '\nNão feche esta janela enquanto o sistema estiver em uso.\n');
});
}
const sair = async () => { try { if (timerGravar) clearTimeout(timerGravar); gravarAgora(); if (NUVEM) { const t = Date.now(); while ((nuvemOcupada || nuvemPendente) && Date.now() - t < 4000) await new Promise(r => setTimeout(r, 100)); } } catch (e) { /* ignora */ } process.exit(0); };
process.on('SIGINT', sair); process.on('SIGTERM', sair);
module.exports = { hashSenha };

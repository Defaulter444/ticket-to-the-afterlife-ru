const ID = 'ticket-to-the-afterlife-ru';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function context(sceneId, encounterId, players) {
  if (!game.user.isGM) throw new Error('Подготовка доступна только рефери.');
  const scene = game.scenes.get(sceneId);
  if (!scene) throw new Error('Сцена не найдена.');
  const entry = scene.getFlag(ID, 'encounters')?.find(e => e.id === encounterId);
  if (!entry) throw new Error('Для этой сцены нет выбранной встречи.');
  if (![2, 3].includes(players)) throw new Error('Выберите двух или трёх персонажей.');
  return {scene, entry};
}

async function prepareEncounter(sceneId, encounterId, players) {
  const {scene} = context(sceneId, encounterId, players);
  if (game.combats.some(c => c.scene?.id === sceneId && c.started)) {
    throw new Error('Сначала завершите бой на этой сцене. Подкрепление можно раскрыть отдельной кнопкой.');
  }
  const updates = scene.tokens.filter(t => t.getFlag(ID, 'encounter')).map(token => ({
    _id: token.id,
    hidden: !(token.getFlag(ID, 'encounter') === encounterId && token.getFlag(ID, 'wave') === 0 && token.getFlag(ID, 'minPlayers') <= players)
  }));
  await scene.updateEmbeddedDocuments('Token', updates);
  await scene.setFlag(ID, 'preparedEncounter', {id: encounterId, players});
  ui.notifications.info(`Встреча подготовлена для ${players} персонажей. Резерв скрыт.`);
  return {sceneId, encounterId, players, visible: updates.filter(t => !t.hidden).length};
}

async function revealWave(sceneId, wave) {
  const scene = game.scenes.get(sceneId);
  const prepared = scene?.getFlag(ID, 'preparedEncounter');
  if (!prepared) throw new Error('Сначала подготовьте встречу.');
  context(sceneId, prepared.id, prepared.players);
  if (![1, 2].includes(wave)) throw new Error('Неизвестная волна.');
  const tokens = scene.tokens.filter(t => t.getFlag(ID, 'encounter') === prepared.id && t.getFlag(ID, 'wave') === wave && t.getFlag(ID, 'minPlayers') <= prepared.players);
  if (!tokens.length) return ui.notifications.info('В этой встрече такого резерва нет.');
  await scene.updateEmbeddedDocuments('Token', tokens.filter(t=>t.hidden).map(t=>({_id:t.id, hidden:false})));
  ui.notifications.info('Токены показаны. Добавьте бойцов в бой в предусмотренный сценарием момент; сюжетные объекты в инициативу добавлять не нужно.');
  return tokens.map(t=>t.id);
}

function encounterDialog() {
  if (!game.user.isGM) return ui.notifications.warn('Подготовка доступна только рефери.');
  const scene = canvas.scene;
  const entries = scene?.getFlag(ID, 'encounters') ?? [];
  if (!entries.length) return ui.notifications.info('Откройте карту с подготовленной встречей. Список есть в журнале «Начните здесь».');
  const saved = scene.getFlag(ID, 'preparedEncounter');
  const content = `<form><div class="form-group"><label>Встреча</label><select name="encounter">${entries.map(e=>`<option value="${escape(e.id)}" ${e.id===saved?.id?'selected':''}>${escape(e.title)}</option>`).join('')}</select></div><div class="form-group"><label>Персонажей в группе</label><select name="players"><option value="2">2 — стартовые персонажи</option><option value="3" ${saved?.players===3?'selected':''}>3 — стартовые персонажи</option></select></div><p>Подготовка показывает основной отряд и скрывает резерв. Текущие ПЗ, позиции и ваши собственные токены сохраняются.</p><div class="ttta-encounter-brief"></div></form>`;
  const run = fn => async html => {try {await fn(html);}catch(e){console.error(ID,e);ui.notifications.error(e.message);}};
  const revealSelected = (html, wave) => {
    const prepared = scene.getFlag(ID, 'preparedEncounter');
    if (prepared?.id !== html.find('[name=encounter]').val() || prepared?.players !== Number(html.find('[name=players]').val())) {
      throw new Error('Сначала подготовьте выбранную встречу с указанным числом персонажей.');
    }
    return revealWave(scene.id, wave);
  };
  return new Dialog({title:'Билет в «Посмертие» — встреча для малой группы',content,buttons:{
    prepare:{icon:'<i class="fas fa-users"></i>',label:'Подготовить',callback:run(html=>prepareEncounter(scene.id, html.find('[name=encounter]').val(), Number(html.find('[name=players]').val())))},
    reserve:{icon:'<i class="fas fa-user-plus"></i>',label:'Показать резерв',callback:run(html=>revealSelected(html,1))},
    turrets:{icon:'<i class="fas fa-crosshairs"></i>',label:'Показать турели',callback:run(html=>revealSelected(html,2))}
  },render:html=>{
    const refresh = () => {
      const selected = html.find('[name=encounter]').val();
      const players = Number(html.find('[name=players]').val());
      const prepared = scene.getFlag(ID, 'preparedEncounter');
      const labels = selected === 'danger-training' ? ['Показать волну 2','Показать волну 3'] : selected.startsWith('convoy-') ? ['Показать резерв','Освободить машины'] : ['Показать резерв','Показать турели'];
      html.find('[data-button="reserve"]').html('<i class="fas fa-user-plus"></i> '+labels[0]);
      html.find('[data-button="turrets"]').html('<i class="fas fa-crosshairs"></i> '+labels[1]);
      html.find('.ttta-encounter-brief').text(entries.find(e=>e.id===selected)?.brief??'');
      for (const [button, wave] of [['reserve',1],['turrets',2]]) {
        const available = scene.tokens.some(t=>t.getFlag(ID,'encounter')===selected && t.getFlag(ID,'wave')===wave && t.getFlag(ID,'minPlayers')<=players);
        html.find(`[data-button="${button}"]`).prop('disabled', !available || prepared?.id!==selected || prepared?.players!==players);
      }
    };
    html.find('[name=encounter],[name=players]').on('change',refresh);refresh();
  }},{width:620}).render(true);
}

Hooks.once('ready',()=>{game.modules.get(ID).api={prepareEncounter,revealWave,encounterDialog};});

// In Foundry v12, a standard Scene UUID opens its attached journal. Our explicit
// "Open map" links must instead show the canvas, without activating it for players.
Hooks.on('renderJournalSheet', (_app, html) => {
  html.off('click.tttaScene', 'a[data-ttta-scene]').on('click.tttaScene', 'a[data-ttta-scene]', async event => {
    event.preventDefault();
    if (!game.user.isGM) return ui.notifications.warn('Эта навигация предназначена для рефери.');
    const scene = game.scenes.get(event.currentTarget.dataset.tttaScene);
    if (!scene) return ui.notifications.warn('Сначала импортируйте карты приключения.');
    try {await scene.view();} catch (error) {ui.notifications.error(error.message);}
  });
});

import type { Page } from 'playwright';

interface EditFormState {
  title: string;
  description: string;
  price: string;
  brand: number | null;
  size: number | null;
  condition: number | null;
  colors: number[];
  materials: number[];
  packageSize: number | null;
}

const choices = {
  brand: [
    [254956, 'Jako'],
    [317425, 'Jako-o'],
    [1, 'Gesperrte Marke'],
  ],
  size: [
    [607, '38'],
    [608, '39'],
  ],
  condition: [
    [2, 'Sehr gut'],
    [3, 'Gut'],
  ],
  color: [
    [1, 'Blau'],
    [2, 'Gelb'],
    [3, 'Rot'],
  ],
  material: [
    [149, 'Acryl'],
    [150, 'Wolle'],
  ],
} as const;

/** Synthetische Bearbeitungsmaske mit eigenem Speicherstand; keine Anfrage verlässt den Test. */
export async function createVintedListingEditFormFixture(
  page: Pick<Page, 'route'>,
  options: { foreign?: boolean; ignoreSave?: boolean; state?: Partial<EditFormState> } = {},
) {
  let saves = 0,
    writes = 0;
  let state: EditFormState = {
    title: 'Meine Schuhe',
    description: 'Sehr gut erhalten.',
    price: '20,50 €',
    brand: 254956,
    size: 607,
    condition: 2,
    colors: [1, 2],
    materials: [149],
    packageSize: 2,
    ...options.state,
  };
  const option = (
    field: keyof typeof choices,
    role: 'radio' | 'checkbox',
    selected: readonly (number | null)[],
  ) =>
    choices[field]
      .map(([id, label]) => {
        const identifier =
          field === 'size'
            ? `data-testid="size-group-31-grid-option-${id}"`
            : `id="${field}-${id}"`;
        return `<div role="${role}" ${identifier} aria-label="${label}" aria-checked="${selected.includes(id)}"${field === 'brand' && id === 1 ? ' aria-disabled="true"' : ''}>${label}</div>`;
      })
      .join('');
  const label = (field: keyof typeof choices, selected: readonly (number | null)[]) =>
    choices[field]
      .filter(([id]) => selected.includes(id))
      .map(([, text]) => text)
      .join(', ');
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v2/users/current')
      return route.fulfill({
        json: { user: { id: options.foreign ? '456' : '123', login: 'fixture' } },
      });
    if (url.hostname.endsWith('.vinted.net'))
      return route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    if (route.request().method() !== 'GET') writes++;
    if (url.pathname === '/fixture/save') {
      saves++;
      if (!options.ignoreSave) state = JSON.parse(route.request().postData()!) as EditFormState;
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname !== '/items/98765/edit')
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>Inserat</h1>' });
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<main id="content">
      <input name="photos" type="file" accept="image/jpeg,image/png">
      <input name="title" value="${state.title}"><textarea name="description">${state.description}</textarea><input name="price" value="${state.price}">
      <input id="ai_photo" type="checkbox"><input id="bump" type="checkbox">
      <input id="category" readonly value="Fußballschuhe"><input id="brand" readonly value="${label('brand', [state.brand])}"><input id="size" readonly value="${label('size', [state.size])}"><input id="condition" readonly value="${label('condition', [state.condition])}"><input id="color" readonly value="${label('color', state.colors)}"><input id="material" readonly value="${label('material', state.materials)}">
      <div id="category-options" hidden><div role="radio" id="catalog-2738" aria-checked="true"><span class="web_ui__Cell__title">Fußballschuhe</span></div></div>
      <div id="brand-options" hidden>${option('brand', 'radio', [state.brand])}</div>
      <div id="size-options" hidden>${option('size', 'checkbox', [state.size])}</div>
      <div id="condition-options" hidden>${option('condition', 'radio', [state.condition])}</div>
      <div id="color-options" hidden>${option('color', 'checkbox', state.colors)}</div>
      <div id="material-options" hidden>${option('material', 'checkbox', state.materials)}</div>
      ${[2, 3].map((id) => `<button type="button" id="package-size-${id}">${id === 2 ? 'Mittel' : 'Groß'}</button><label><input type="radio" id="package_type_selector_${id}" aria-labelledby="package-size-${id}"${state.packageSize === id ? ' checked' : ''}></label>`).join('')}
      <div data-testid="media-upload-grid"><div data-testid="image-wrapper-0"><img src="https://images1.vinted.net/tc/fixtureA/f800/1788288106.webp"></div></div>
      <button type="button" id="save">Speichern</button>
      </main><script>
      const names=['category','brand','size','condition','color','material'];
      const multiple=['color','material'];
      const hide=()=>names.forEach(name=>document.querySelector('#'+name+'-options').hidden=true);
      const options=name=>[...document.querySelectorAll('#'+name+'-options [role]')];
      const selected=name=>options(name).filter(node=>node.getAttribute('aria-checked')==='true');
      const identifier=node=>Number(/([0-9]+)$/.exec(node.id||node.dataset.testid)[1]);
      names.forEach(name=>{
        document.querySelector('#'+name).onclick=()=>{hide();document.querySelector('#'+name+'-options').hidden=false;};
        if(name==='category') return;
        options(name).forEach(node=>node.onclick=()=>{
          if(node.getAttribute('aria-disabled')==='true') return;
          const checked=node.getAttribute('aria-checked')==='true';
          if(!multiple.includes(name)) options(name).forEach(other=>other.setAttribute('aria-checked','false'));
          node.setAttribute('aria-checked',multiple.includes(name)?String(!checked):'true');
          document.querySelector('#'+name).value=selected(name).map(entry=>entry.getAttribute('aria-label')).join(', ');
          if(!multiple.includes(name)) hide();
        });
      });
      document.onkeydown=event=>{if(event.key==='Escape')hide();};
      [2,3].forEach(id=>document.querySelector('#package-size-'+id).onclick=()=>[2,3].forEach(other=>document.querySelector('#package_type_selector_'+other).checked=other===id));
      document.querySelector('#save').onclick=async()=>{
        const one=name=>selected(name).map(identifier)[0]??null;
        await fetch('/fixture/save',{method:'POST',body:JSON.stringify({
          title:document.querySelector('[name=title]').value,description:document.querySelector('[name=description]').value,price:document.querySelector('[name=price]').value,
          brand:one('brand'),size:one('size'),condition:one('condition'),colors:selected('color').map(identifier),materials:selected('material').map(identifier),
          packageSize:[2,3].find(id=>document.querySelector('#package_type_selector_'+id).checked)??null})});
        location.href='/items/98765';
      };
      </script>`,
    });
  });
  return { saves: () => saves, writes: () => writes, state: () => state };
}

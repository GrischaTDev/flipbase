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
  photos: string[];
}

/** Fotoadressen der Testmaske; die erste ist das Titelbild. */
export const editFormPhotoUrls = [
  'https://images1.vinted.net/tc/fixtureA/f800/1788288106.webp',
  'https://images1.vinted.net/tc/fixtureB/f800/1788288107.webp',
  'https://images1.vinted.net/tc/fixtureC/f800/1788288108.webp',
] as const;

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
  options: {
    foreign?: boolean;
    ignoreSave?: boolean;
    state?: Partial<EditFormState>;
    /** So viele Ablagen eines gezogenen Fotos bleiben ohne Wirkung. */
    ignoredPhotoDrops?: number;
    /**
     * Was Vinteds Abfrage des Inserats liefert: den vollen gespeicherten Stand (Standard), nur
     * Kennung und Kategorie, oder Fotos unter Adressen, die nicht zum Raster passen.
     */
    itemApi?: 'full' | 'reference' | 'foreign-photo-urls';
  } = {},
) {
  let saves = 0,
    writes = 0,
    listOpens = 0,
    itemReads = 0;
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
    photos: [editFormPhotoUrls[0]],
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
    // Wie bei Vinted: Die Bearbeitungsmaske erhält das Inserat mit seiner Kategorie hierüber.
    if (url.pathname === '/api/v2/item_upload/items/98765') {
      itemReads++;
      if (options.itemApi === 'reference')
        return route.fulfill({ json: { item: { id: 98765, catalog_id: 2738 }, code: 0 } });
      // Aufbau wie am 12.10.2026 an Vinteds Schnittstelle gemessen (nur Feldnamen und Typen).
      const price = /^([0-9]+)(?:[,.]([0-9]{1,2}))?/.exec(state.price.split('€').join('').trim());
      const brand = choices.brand.find(([id]) => id === state.brand);
      return route.fulfill({
        json: {
          code: 0,
          item: {
            id: 98765,
            catalog_id: 2738,
            title: state.title,
            description: state.description,
            price: {
              amount: price ? price[1] + '.' + (price[2] ?? '0') : '0',
              currency_code: 'EUR',
            },
            brand_id: state.brand,
            brand_dto: brand ? { id: brand[0], title: brand[1] } : null,
            color1_id: state.colors[0] ?? null,
            color2_id: state.colors[1] ?? null,
            package_size_id: state.packageSize,
            item_attributes: [
              { code: 'size', ids: state.size === null ? [] : [state.size] },
              { code: 'condition', ids: state.condition === null ? [] : [state.condition] },
              { code: 'material', ids: state.materials },
            ],
            photos: state.photos.map((photoUrl, index) => {
              const address =
                options.itemApi === 'foreign-photo-urls'
                  ? 'https://images1.vinted.net/other/' + index + '.webp'
                  : photoUrl;
              return {
                id:
                  5000 + editFormPhotoUrls.indexOf(photoUrl as (typeof editFormPhotoUrls)[number]),
                url: address + '?s=fixture',
                full_size_url: address,
                thumbnails: [{ type: 'thumb310', url: address }],
                is_main: index === 0,
              };
            }),
          },
        },
      });
    }
    if (url.pathname === '/fixture/list-open') {
      listOpens++;
      return route.fulfill({ json: { ok: true } });
    }
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
      <div id="category-options" hidden><div role="radio" id="catalog-suggestion-2738" aria-checked="false"><span class="web_ui__Cell__title">Fußballschuhe</span></div><div role="button" id="catalog-1193">Kinder</div></div>
      <div id="brand-options" hidden>${option('brand', 'radio', [state.brand])}</div>
      <div id="size-options" hidden>${option('size', 'checkbox', [state.size])}</div>
      <div id="condition-options" hidden>${option('condition', 'radio', [state.condition])}</div>
      <div id="color-options" hidden>${option('color', 'checkbox', state.colors)}</div>
      <div id="material-options" hidden><div role="checkbox" id="material-suggestion-298" aria-checked="false">Wildleder</div>${option('material', 'checkbox', state.materials)}</div>
      ${[2, 3].map((id) => `<button type="button" id="package-size-${id}">${id === 2 ? 'Mittel' : 'Groß'}</button><label><input type="radio" id="package_type_selector_${id}" aria-labelledby="package-size-${id}"${state.packageSize === id ? ' checked' : ''}></label>`).join('')}
      <div data-testid="media-upload-grid" style="display:flex;gap:8px;user-select:none"></div>
      <button type="button" id="save">Speichern</button>
      </main><script>
      let photos=${JSON.stringify(state.photos)};
      const grid=document.querySelector('[data-testid=media-upload-grid]');
      let dragged=null,start=null,active=false,hold=null,ignoredDrops=${options.ignoredPhotoDrops ?? 0};
      const renderPhotos=()=>{
        grid.innerHTML=photos.map((url,index)=>'<div class="photo-box" style="position:relative;width:80px;height:80px"><div role="button" tabindex="0" aria-roledescription="sortable" data-index="'+index+'" style="width:80px;height:80px;cursor:grab"><div data-testid="image-wrapper-'+index+'"><img draggable="false" style="width:80px;height:80px;pointer-events:none" src="'+url+'"></div></div><button type="button" style="position:absolute;top:0;right:0" data-testid="media-select-grid-delete-button-'+index+'" aria-label="Ausgewähltes Foto entfernen">x</button></div>').join('');
        grid.querySelectorAll('[data-testid^=media-select-grid-delete-button-]').forEach((button,index)=>button.onclick=()=>{photos=photos.filter((_,position)=>position!==index);renderPhotos();});
        grid.querySelectorAll('[aria-roledescription=sortable]').forEach(node=>node.onpointerdown=event=>{dragged=Number(node.dataset.index);start=[event.clientX,event.clientY];active=false;clearTimeout(hold);hold=setTimeout(()=>{active=true;},250);});
      };
      // Bewusst strenger als gemessen: Welche Bedingung der Ziehrahmen der echten Maske stellt, ist
      // nicht bekannt. Hier zählt ein Zug nur nach kurzem Halten ohne Bewegung und mit erkennbarem Weg.
      document.onpointermove=event=>{
        if(dragged===null||active) return;
        if(Math.hypot(event.clientX-start[0],event.clientY-start[1])>5){clearTimeout(hold);dragged=null;}
      };
      document.onpointerup=event=>{
        clearTimeout(hold);
        if(dragged===null) return;
        const from=dragged,held=active,moved=Math.hypot(event.clientX-start[0],event.clientY-start[1]);
        dragged=null;active=false;
        const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.photo-box');
        if(!held||!target||moved<8) return;
        if(ignoredDrops-->0) return;
        const to=[...grid.children].indexOf(target);
        if(to<0||to===from) return;
        const [photo]=photos.splice(from,1);photos.splice(to,0,photo);renderPhotos();
      };
      renderPhotos();
      // Annahme, an der echten Maske nicht gemessen: Der Preis erhält sein Format erst beim
      // Verlassen des Feldes. Ein Wert, der sich dadurch während des Lesens ändert, gilt dem Leser
      // als veränderte Maske.
      const priceInput=document.querySelector('[name=price]');
      priceInput.onblur=()=>{
        const match=/^([0-9]+)(?:[,.]([0-9]{1,2}))?$/.exec(priceInput.value.split('€').join('').trim());
        if(match) priceInput.value=match[1]+','+(match[2]||'').padEnd(2,'0')+' €';
      };
      const names=['category','brand','size','condition','color','material'];
      const multiple=['color','material'];
      const hide=()=>names.forEach(name=>document.querySelector('#'+name+'-options').hidden=true);
      const options=name=>[...document.querySelectorAll('#'+name+'-options [role]')];
      const selected=name=>options(name).filter(node=>node.getAttribute('aria-checked')==='true');
      const identifier=node=>Number(/([0-9]+)$/.exec(node.id||node.dataset.testid)[1]);
      names.forEach(name=>{
        document.querySelector('#'+name).onclick=()=>{fetch('/fixture/list-open');hide();document.querySelector('#'+name+'-options').hidden=false;};
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
          packageSize:[2,3].find(id=>document.querySelector('#package_type_selector_'+id).checked)??null,photos})});
        location.href='/items/98765';
      };
      </script>`,
    });
  });
  return {
    saves: () => saves,
    writes: () => writes,
    state: () => state,
    /** Wie oft eine Auswahlliste der Maske geöffnet wurde. */
    listOpens: () => listOpens,
    /** Wie oft Vinteds Abfrage des Inserats aufgerufen wurde. */
    itemReads: () => itemReads,
  };
}

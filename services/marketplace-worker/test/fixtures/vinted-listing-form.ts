import type { Page } from 'playwright';
export async function createVintedListingFormFixture(
  page: Pick<Page, 'route' | 'goto'>,
  options: {
    cached?: boolean;
    unknown?: boolean;
    disabledSize?: boolean;
    hiddenPackage?: boolean;
    publishing?: boolean;
    savedPrice?: string;
    active?: boolean;
    noSaveNavigation?: boolean;
    saveRedirect?: 'profile' | 'foreign_profile' | 'other_item';
    saveResponse?: unknown;
    saveStatus?: number;
    saveContentType?: string;
    lostSaveResponse?: boolean;
    brandSearch?: 'matching' | 'wrong_label' | 'custom_only';
    brandSearchStartsEmpty?: boolean;
    brandSearchPortal?: boolean;
    colorGrid?: boolean;
    categoryLoadingDelayMs?: number;
    brandLoadingDelayMs?: number;
    brandChoicesDelayMs?: number;
    nativePackage?: boolean;
  } = {},
) {
  let writes = 0,
    account = '123',
    savedBody: string | null = null,
    uploads = 0,
    saves = 0;
  const brandQueries: string[] = [];
  const uploadedFileNames: string[] = [];
  await page.route('**/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v2/users/current')
      return route.fulfill({ json: { user: { id: account, login: 'fixture' } } });
    if (new URL(route.request().url()).hostname === 'images1.vinted.net')
      return route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    if (path === '/fixture/brand-search') {
      brandQueries.push(new URL(route.request().url()).searchParams.get('query') ?? '');
      return route.fulfill({ json: { ok: true } });
    }
    if (savedBody && path === '/items/456/edit')
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: savedBody });
    if (route.request().method() !== 'GET') writes++;
    if (path === '/fixture/photo') {
      uploads++;
      uploadedFileNames.push(new URL(route.request().url()).searchParams.get('name') ?? '');
      return route.fulfill({
        json: {
          url: `https://images1.vinted.net/tc/fixtureAsset${uploads === 1 ? '' : uploads}/f800/1788288106.webp`,
        },
      });
    }
    if (path === '/api/v2/item_upload/items' && route.request().method() === 'POST') {
      saves++;
      savedBody = route.request().postData()!;
      if (options.savedPrice)
        savedBody = savedBody.replace('value="12,00"', 'value="' + options.savedPrice + '"');
      if (options.lostSaveResponse) return route.abort();
      const url =
        options.saveRedirect === 'profile'
          ? '/member/123'
          : options.saveRedirect === 'foreign_profile'
            ? '/member/124'
            : options.saveRedirect === 'other_item'
              ? '/items/457-fixture'
              : '/items/456-fixture';
      return route.fulfill({
        status: options.saveStatus ?? 200,
        contentType: options.saveContentType ?? 'application/json',
        json:
          options.saveResponse === undefined ? { item: { id: 456 }, url } : options.saveResponse,
      });
    }
    if (path === '/member/123')
      return route.fulfill({
        contentType: 'text/html',
        body: `<div id="content"><a href="/settings/profile">Profil bearbeiten</a><button data-testid="closet-seller-filters-active" aria-pressed="true">Aktiv</button><button data-testid="closet-seller-filters-sold" aria-pressed="false">Verkauft</button>${options.active === false ? '' : '<a data-testid="product-item-id-456--overlay-link" href="/items/456" title="Jacke">Jacke</a>'}</div>`,
      });
    if (path === '/items/456-fixture')
      return route.fulfill({ contentType: 'text/html', body: '<h1>Jacke</h1>' });
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<div id="content">
      <input name="photos" data-testid="add-photos-input" type="file" multiple accept="image/jpeg,image/gif,image/png,image/webp">
      ${options.publishing ? '<div data-testid="media-upload-grid"></div><input type="checkbox" id="ai_photo"><input type="checkbox" id="bump">' : ''}
      <input name="title" id="title" value="${options.cached ? 'Eigene Arbeit' : ''}"><textarea name="description" id="description"></textarea><input name="price" id="price">
      <input readonly id="category" name="category"><input readonly id="brand" name="brand"><input readonly id="size" name="size"><input readonly id="condition" name="condition"><input readonly id="color" name="color"><input readonly id="material" name="material">
      ${options.unknown ? '<input id="isbn" name="isbn">' : ''}
      <div hidden id="category-options"><button type="button" id="catalog-5">Herren</button>${options.categoryLoadingDelayMs ? '<div id="category-previous-leaves"><div role="radio" id="catalog-999" aria-checked="false">Vorherige Kategorie</div></div>' : ''}<div hidden id="category-leaves"><div role="radio" id="catalog-1223" aria-checked="false"><div class="web_ui__Cell__title">Bomberjacken</div></div></div></div>
      <div hidden id="brand-options"><div id="brand-popular"><div role="radio" id="empty-brand" aria-label="Keine Marke" aria-checked="false">Keine Marke</div></div>
      ${options.brandSearch ? `<input id="brand-search-input" data-testid="brand-search--input" placeholder="Marke suchen"><div id="brand-results" hidden><div role="radio" id="brand-317425" aria-label="Jako-o" aria-checked="false">Jako-o</div>${options.brandSearch === 'custom_only' ? '' : `<div role="radio" id="brand-254956" aria-label="${options.brandSearch === 'wrong_label' ? 'Falsche Marke' : 'Jako'}" aria-checked="false">Jako</div>`}<div role="radio" id="custom-select-brand-radio" aria-checked="false">Jako als Markenname nutzen</div></div>` : ''}</div>
      <div hidden id="size-options"><div role="checkbox" data-testid="size-group-14-grid-option-208" aria-label="M" aria-checked="false" aria-disabled="${options.disabledSize ? 'true' : 'false'}">M</div><div role="checkbox" data-testid="size-group-14-grid-option-209" aria-label="L" aria-checked="false">L</div></div>
      <div hidden id="condition-options"><div role="radio" id="condition-2" aria-checked="false"><div data-testid="condition-2--title">Sehr gut</div></div></div>
      <div hidden id="color-options">${options.colorGrid ? '<div role="checkbox" data-testid="filter-grid-option-3" aria-label="Grau" aria-checked="false"><div data-testid="color-3"><span>Grau</span></div></div>' : '<div role="checkbox" id="color-3" aria-checked="false"><div data-testid="color-3--title">Grau</div></div>'}</div>
      <div hidden id="material-options"><div role="checkbox" id="material-149" aria-checked="false"><div data-testid="material-149--title">Acryl</div></div></div>
      ${[2, 3]
        .map((id) =>
          options.nativePackage
            ? `<div id="package-size-${id}" role="presentation" data-testid="${id}-package-size--cell"><div data-testid="${id}-package-size--cell--title" class="web_ui__Cell__title">${id === 2 ? '<div data-package-recommendation>Empfohlen</div>' : ''}<div></div><span>${id === 2 ? 'Mittel' : 'Groß'}</span></div><p>Für Artikel in einem Karton</p><a data-package-information>Infos zu Größen und Entschädigungen</a><label for="package_type_selector_${id}"><input type="radio" name="package" id="package_type_selector_${id}" aria-labelledby="package-size-${id}"${id === 3 ? ' checked' : ''}><span></span></label></div>`
            : `<button type="button" id="package-size-${id}">${id === 2 ? 'Mittel' : 'Groß'}</button><label><input style="opacity:${options.hiddenPackage ? '0' : '1'}" type="radio" id="package_type_selector_${id}" aria-labelledby="package-size-${id}"${id === 3 ? ' checked' : ''}></label>`,
        )
        .join('')}
      <button type="button" data-testid="upload-form-save-button">Hochladen</button>
      </div><script>
      // Beim erneuten Laden kann das gespeicherte Portal erst hinter diesem Script stehen.
      document.addEventListener('DOMContentLoaded',()=>{
      const fields=['category','brand','size','condition','color','material'];
      if(${!!options.brandSearchPortal}) document.body.append(document.querySelector('#brand-options'));
      let hasRequestedBrandChoices=false;
      const hide=()=>fields.forEach(field=>document.querySelector('#'+field+'-options').hidden=true);
      fields.forEach(field=>{
        document.querySelector('#'+field).onclick=()=>{hide();document.querySelector('#'+field+'-options').hidden=false;if(field==='category'){document.querySelector('#catalog-5').hidden=false;document.querySelector('#category-leaves').hidden=true;}if(field==='brand'&&${!!options.brandSearch}){document.querySelector('#brand-search-input').value='';document.querySelector('#brand-popular').hidden=${!!options.brandSearchStartsEmpty}||document.querySelector('#brand').value==='Jako';document.querySelector('#brand-results').hidden=document.querySelector('#brand').value!=='Jako';}if(field==='brand'&&${!!options.brandChoicesDelayMs}&&!hasRequestedBrandChoices){hasRequestedBrandChoices=true;document.querySelector('#brand-options').hidden=true;setTimeout(()=>document.querySelector('#brand-options').hidden=false,${options.brandChoicesDelayMs ?? 0});}};
        document.querySelectorAll('#'+field+'-options [role=radio],#'+field+'-options [role=checkbox]').forEach(node=>node.onclick=()=>{
          if(node.getAttribute('aria-disabled')==='true') return;
          const apply=()=>{node.setAttribute('aria-checked',node.getAttribute('aria-checked')!=='true'?'true':'false');document.querySelector('#'+field).value=node.getAttribute('aria-label')||node.textContent;if(field==='category'&&${!!options.brandLoadingDelayMs}){document.querySelector('#brand').disabled=true;setTimeout(()=>document.querySelector('#brand').disabled=false,${options.brandLoadingDelayMs ?? 0});}if(!['color','material'].includes(field)) hide();};
          if(field==='category'&&${!!options.categoryLoadingDelayMs}) setTimeout(apply,${options.categoryLoadingDelayMs ?? 0});else if(field==='brand'&&${!!options.brandSearch}) setTimeout(apply,60);else apply();
        });
      });
      if(${!!options.brandSearch}) document.querySelector('#brand-search-input').oninput=async event=>{
        document.querySelector('#brand-popular').hidden=true;document.querySelector('#brand-results').hidden=true;
        await fetch('/fixture/brand-search?query='+encodeURIComponent(event.target.value));
        setTimeout(()=>document.querySelector('#brand-results').hidden=false,60);
      };
      document.querySelector('#catalog-5').onclick=()=>{const showCategory=()=>{document.querySelector('#catalog-5').hidden=true;document.querySelector('#category-leaves').hidden=false;const previous=document.querySelector('#category-previous-leaves');if(previous)previous.hidden=true;};if(${!!options.categoryLoadingDelayMs}){const previous=document.querySelector('#category-previous-leaves');previous.hidden=false;setTimeout(showCategory,${options.categoryLoadingDelayMs ?? 0});}else showCategory();};
      document.onkeydown=event=>{if(event.key==='Escape') hide();};
      if(!${!!options.nativePackage}) [2,3].forEach(id=>document.querySelector('#package-size-'+id).onclick=()=>{[2,3].forEach(other=>document.querySelector('#package_type_selector_'+other).checked=other===id);});
      if(${!!options.nativePackage}) document.querySelector('#price').oninput=()=>document.querySelectorAll('[data-package-recommendation],[data-package-information]').forEach(element=>element.remove());
      document.querySelector('[data-testid="upload-form-save-button"]').onclick=async()=>{
        const clone=document.documentElement.cloneNode(true);
        document.querySelectorAll('input,textarea').forEach((source,index)=>{
          const target=clone.querySelectorAll('input,textarea')[index];
          if(source.tagName==='INPUT') {target.setAttribute('value',source.value);if(source.checked)target.setAttribute('checked','');else target.removeAttribute('checked');}
          else target.textContent=source.value;
        });
        const response=await fetch('/api/v2/item_upload/items',{method:'POST',headers:{'X-Upload-Form':'true'},body:clone.outerHTML});
        if(${options.publishing === true && !options.noSaveNavigation}) location.href=(await response.json()).url;
      };
      if(${options.publishing === true}) document.querySelector('input[name="photos"]').onchange=async event=>{
        const grid=document.querySelector('[data-testid="media-upload-grid"]');
        const wrapper=document.createElement('div');wrapper.dataset.testid='image-wrapper-'+grid.querySelectorAll('[data-testid^="image-wrapper-"]').length;
        const image=document.createElement('img');image.src=URL.createObjectURL(event.target.files[0]);wrapper.append(image);
        grid.append(wrapper);
        image.src=(await(await fetch('/fixture/photo?name='+encodeURIComponent(event.target.files[0].name),{method:'POST',body:event.target.files[0]})).json()).url;
      };
      });
      </script>`,
    });
  });
  await page.goto('https://www.vinted.de/items/new');
  return {
    writes: () => writes,
    uploads: () => uploads,
    saves: () => saves,
    brandQueries: () => [...brandQueries],
    uploadedFileNames: () => [...uploadedFileNames],
    setSavedBody: (body: string) => {
      savedBody = body;
    },
    changeAccount: () => {
      account = '124';
    },
    authorize: async () => undefined,
  };
}

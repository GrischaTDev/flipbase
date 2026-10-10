import type { Page } from 'playwright';
export async function createVintedListingFormFixture(
  page: Page,
  options: {
    cached?: boolean;
    unknown?: boolean;
    disabledSize?: boolean;
    hiddenPackage?: boolean;
    publishing?: boolean;
    savedPrice?: string;
    active?: boolean;
    noSaveNavigation?: boolean;
  } = {},
) {
  let writes = 0,
    account = '123',
    savedBody: string | null = null,
    uploads = 0,
    saves = 0;
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
    if (savedBody && path === '/items/456/edit')
      return route.fulfill({ contentType: 'text/html', body: savedBody });
    if (route.request().method() !== 'GET') writes++;
    if (path === '/fixture/photo') {
      uploads++;
      return route.fulfill({
        json: { url: 'https://images1.vinted.net/tc/fixtureAsset/f800/1788288106.webp' },
      });
    }
    if (path === '/fixture/save') {
      saves++;
      savedBody = route.request().postData()!;
      if (options.savedPrice)
        savedBody = savedBody.replace('value="12,00"', 'value="' + options.savedPrice + '"');
      return route.fulfill({ json: { url: '/items/456-fixture' } });
    }
    if (path === '/member/123')
      return route.fulfill({
        contentType: 'text/html',
        body: `<div id="content"><a href="/settings/profile">Profil bearbeiten</a><button data-testid="closet-seller-filters-active" aria-pressed="true">Aktiv</button><button data-testid="closet-seller-filters-sold" aria-pressed="false">Verkauft</button>${options.active === false ? '' : '<a data-testid="product-item-id-456--overlay-link" href="/items/456" title="Jacke">Jacke</a>'}</div>`,
      });
    if (path === '/items/456-fixture')
      return route.fulfill({ contentType: 'text/html', body: '<h1>Jacke</h1>' });
    return route.fulfill({
      contentType: 'text/html',
      body: `<div id="content">
      <input name="photos" data-testid="add-photos-input" type="file" multiple accept="image/jpeg,image/gif,image/png,image/webp">
      ${options.publishing ? '<div data-testid="media-upload-grid"></div><input type="checkbox" id="ai_photo"><input type="checkbox" id="bump">' : ''}
      <input name="title" id="title" value="${options.cached ? 'Eigene Arbeit' : ''}"><textarea name="description" id="description"></textarea><input name="price" id="price">
      <input readonly id="category" name="category"><input readonly id="brand" name="brand"><input readonly id="size" name="size"><input readonly id="condition" name="condition"><input readonly id="color" name="color"><input readonly id="material" name="material">
      ${options.unknown ? '<input id="isbn" name="isbn">' : ''}
      <div hidden id="category-options"><button type="button" id="catalog-5">Herren</button><div hidden id="category-leaves"><div role="radio" id="catalog-1223" aria-checked="false"><div class="web_ui__Cell__title">Bomberjacken</div></div></div></div>
      <div hidden id="brand-options"><div role="radio" id="empty-brand" aria-label="Keine Marke" aria-checked="false">Keine Marke</div></div>
      <div hidden id="size-options"><div role="checkbox" data-testid="size-group-14-grid-option-208" aria-label="M" aria-checked="false" aria-disabled="${options.disabledSize ? 'true' : 'false'}">M</div><div role="checkbox" data-testid="size-group-14-grid-option-209" aria-label="L" aria-checked="false">L</div></div>
      <div hidden id="condition-options"><div role="radio" id="condition-2" aria-checked="false"><div data-testid="condition-2--title">Sehr gut</div></div></div>
      <div hidden id="color-options"><div role="checkbox" id="color-3" aria-checked="false"><div data-testid="color-3--title">Grau</div></div></div>
      <div hidden id="material-options"><div role="checkbox" id="material-149" aria-checked="false"><div data-testid="material-149--title">Acryl</div></div></div>
      <button type="button" id="package-size-2">Mittel</button><label><input style="opacity:${options.hiddenPackage ? '0' : '1'}" type="radio" id="package_type_selector_2" aria-labelledby="package-size-2"></label>
      <button type="button" id="package-size-3">Groß</button><label><input style="opacity:${options.hiddenPackage ? '0' : '1'}" type="radio" id="package_type_selector_3" aria-labelledby="package-size-3" checked></label>
      <button type="button" data-testid="upload-form-save-button">Hochladen</button>
      </div><script>
      const fields=['category','brand','size','condition','color','material'];
      const hide=()=>fields.forEach(field=>document.querySelector('#'+field+'-options').hidden=true);
      fields.forEach(field=>{
        document.querySelector('#'+field).onclick=()=>{hide();document.querySelector('#'+field+'-options').hidden=false;if(field==='category'){document.querySelector('#catalog-5').hidden=false;document.querySelector('#category-leaves').hidden=true;}};
        document.querySelectorAll('#'+field+'-options [role=radio],#'+field+'-options [role=checkbox]').forEach(node=>node.onclick=()=>{
          if(node.getAttribute('aria-disabled')==='true') return;
          node.setAttribute('aria-checked',node.getAttribute('aria-checked')!=='true'?'true':'false');
          document.querySelector('#'+field).value=node.getAttribute('aria-label')||node.textContent;
          if(!['color','material'].includes(field)) hide();
        });
      });
      document.querySelector('#catalog-5').onclick=()=>{document.querySelector('#catalog-5').hidden=true;document.querySelector('#category-leaves').hidden=false;};
      document.onkeydown=event=>{if(event.key==='Escape') hide();};
      [2,3].forEach(id=>document.querySelector('#package-size-'+id).onclick=()=>{[2,3].forEach(other=>document.querySelector('#package_type_selector_'+other).checked=other===id);});
      document.querySelector('[data-testid="upload-form-save-button"]').onclick=async()=>{
        const clone=document.documentElement.cloneNode(true);
        document.querySelectorAll('input,textarea').forEach((source,index)=>{
          const target=clone.querySelectorAll('input,textarea')[index];
          if(source.tagName==='INPUT') {target.setAttribute('value',source.value);if(source.checked)target.setAttribute('checked','');else target.removeAttribute('checked');}
          else target.textContent=source.value;
        });
        const response=await fetch('/fixture/save',{method:'POST',body:clone.outerHTML});
        if(${options.publishing === true && !options.noSaveNavigation}) location.href=(await response.json()).url;
      };
      if(${options.publishing === true}) document.querySelector('input[name="photos"]').onchange=async event=>{
        const wrapper=document.createElement('div');wrapper.dataset.testid='image-wrapper-0';
        const image=document.createElement('img');image.src=URL.createObjectURL(event.target.files[0]);wrapper.append(image);
        document.querySelector('[data-testid="media-upload-grid"]').append(wrapper);
        image.src=(await(await fetch('/fixture/photo',{method:'POST',body:event.target.files[0]})).json()).url;
      };
      </script>`,
    });
  });
  await page.goto('https://www.vinted.de/items/new');
  return {
    writes: () => writes,
    uploads: () => uploads,
    saves: () => saves,
    setSavedBody: (body: string) => {
      savedBody = body;
    },
    changeAccount: () => {
      account = '124';
    },
    authorize: async () => undefined,
  };
}

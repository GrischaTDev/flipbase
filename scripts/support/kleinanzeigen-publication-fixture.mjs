// Synthetischer Anbieter für die echte MV3-Veröffentlichung; keine Netzwerkweiterleitung.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const publicationWorkspaceId = '51000000-0000-4000-8000-000000000011';
const workspaceId = publicationWorkspaceId,
  connectionId = '9',
  generation = 2,
  jobId = '12';
const draftId = '51000000-0000-4000-8000-000000000041',
  imageId = '51000000-0000-4000-8000-000000000071';
const target = 'https://www.kleinanzeigen.de/s-anzeige/jacke/1001-1-2';
const bytes = readFileSync('tools/flipbase-extension/images/flipbase-mark-16.png');
const image = {
  imageId,
  storagePath:
    'kleinanzeigen-jobs/' +
    workspaceId +
    '/51000000-0000-4000-8000-000000000061/51000000-0000-4000-8000-000000000062/' +
    imageId +
    '.png',
  fileName: 'Bild.png',
  mimeType: 'image/png',
  byteSize: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
const astro =
  '<script id="astroSharedData" type="application/json">' +
  JSON.stringify({
    user: { userId: 88, accountType: 'PRIVATE' },
    userProfile: { userId: 88, commercialUser: false, contactName: 'Privat' },
  }) +
  '</script>';
const html = (body) =>
  '<!doctype html><html lang="de"><meta charset="utf-8"><title>Synthetischer Anbieter</title>' +
  astro +
  '<body>' +
  body +
  '</body></html>';
const category = html(
  '<div id="postad-category-select-box"><a id="cat_153" href="#?path=153&isParent=true">Mode &amp; Beauty</a><a id="cat_160" href="#?path=153/160&isParent=true">Herrenbekleidung</a><a id="cat_shirts" href="#?path=153/160/shirts&isParent=undefined">Shirts</a></div><form method="post" action="/p-anzeige-aufgeben-schritt2.html"><button type="submit">Weiter</button></form>',
);
function form(paid) {
  return html(`
<main><a href="/p-kategorie-aendern.html">Kategorie ändern</a><div id="ad-category-path">Mode &amp; Beauty &gt; Herrenbekleidung</div>
<div>Bilder (empfohlen)<div><div><div><div><input type="file" multiple accept="image/png,image/jpeg"></div></div></div></div><div id="photos"></div></div>
<input id="ad-title" maxlength="65"><textarea id="ad-description" maxlength="4000"></textarea><input id="ad-price-amount" maxlength="8"><input id="ad-zip-code" maxlength="5"><input id="ad-city" value="Berlin"><input id="ad-name" value="Privat">
<label for="kleidung_herren.art">Art</label><button type="button" role="combobox" id="kleidung_herren.art" aria-required="false">Shirts</button><input type="hidden" name="attributeMap[kleidung_herren.art]" value="shirts">
<input type="hidden" name="attributeMap[kleidung_herren.condition]" id="condition-value"><button type="button" id="condition-trigger" aria-haspopup="dialog">Zustand auswählenBitte wählen</button>
<dialog id="conditions" aria-labelledby="modal-conditions-title"><h2 id="modal-conditions-title">Zustand</h2><input type="radio" id="condition-ok" name="condition" value="ok"><label for="condition-ok">Gut</label><button type="button" id="condition-cancel">Abbrechen</button><button type="button" id="condition-confirm">Bestätigen</button></dialog>
<input type="radio" name="adType" id="ad-type-OFFER" checked><input type="radio" name="shipping" id="ad-shipping-enabled-yes"><input type="radio" name="shipping" id="ad-shipping-enabled-no" checked><button type="button" id="ad-shipping-options">Versandmethoden auswählenHermes Päckchen</button>
<dialog id="shipping-dialog"><h2>Versandmethoden</h2><div id="shipping-content"></div></dialog>
<button type="button" id="ad-price-type">Festpreis</button><div><input type="radio" name="buyNow" id="ad-buy-now-true"><input type="radio" name="buyNow" id="ad-buy-now-false" checked></div><input type="checkbox" id="ad-address-visibility"><input type="checkbox" id="ad-marketing-consent">
<h3>Kostenpflichtige Optionen</h3>${['0:204', '0:914', '0:62', '0:488'].map((value, index) => '<div role="group"><span><input type="checkbox" name="articles" data-includedfp="false" value="' + value + '" ' + (paid && index === 0 ? 'checked' : '') + '></span><label>Option ' + index + ' 4,99 €</label></div>').join('')}
<button type="button" id="publish">Anzeige aufgeben</button></main>
<script>
const byId=id=>document.getElementById(id);byId('condition-trigger').onclick=()=>byId('conditions').showModal();byId('condition-cancel').onclick=()=>byId('conditions').close();byId('condition-confirm').onclick=()=>{byId('condition-value').value=document.querySelector('input[name="condition"]:checked')?.value??'';byId('condition-trigger').textContent='Zustand auswählenGut';byId('conditions').close();};
let group='SMALL';const shipping=byId('shipping-dialog');function methods(){byId('shipping-content').innerHTML='<div><span><input id="method-one" type="checkbox" value="HERMES_001" checked aria-describedby="method-description"></span><label for="method-one">Hermes Päckchen</label><p id="method-description">3,99 €</p></div><button type="button" id="shipping-other">Andere Versandmethoden</button><button type="button" id="shipping-back">Zurück</button><button type="button" id="shipping-close">Schließen</button>';byId('shipping-other').onclick=sizes;byId('shipping-back').onclick=sizes;byId('shipping-close').onclick=()=>shipping.close();}function sizes(){byId('shipping-content').innerHTML=['SMALL','MEDIUM','LARGE'].map(value=>'<div><input type="radio" name="package" id="size-'+value+'" value="'+value+'" '+(value===group?'checked':'')+'><label for="size-'+value+'">'+value+'</label></div>').join('')+'<button type="button" id="shipping-next">Weiter</button>';byId('shipping-next').onclick=()=>{group=document.querySelector('input[name="package"]:checked').value;methods();};}byId('ad-shipping-options').onclick=()=>{methods();shipping.showModal();};
document.querySelector('input[type="file"]').onchange=async event=>{for(const file of event.target.files){const response=await fetch('/fixture-upload',{method:'POST',body:await file.arrayBuffer()});const result=await response.json();if(result.changedCategory){byId('kleidung_herren.art').textContent='Pullover';document.querySelector('input[name="attributeMap[kleidung_herren.art]"]').value='pullover';}const image=document.createElement('img');image.src=result.url;image.alt=file.name;byId('photos').append(image);}};
byId('publish').onclick=async()=>{const response=await fetch('/fixture-submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:byId('ad-title').value,description:byId('ad-description').value,price:byId('ad-price-amount').value,postalCode:byId('ad-zip-code').value,condition:byId('condition-value').value,images:byId('photos').querySelectorAll('img').length,buyNow:byId('ad-buy-now-true').checked,paid:[...document.querySelectorAll('input[name="articles"]')].some(node=>node.checked)})});if(response.ok)location.href='/p-anzeige-aufgeben-schritt3.html';};
</script>`);
}
export function createKleinanzeigenPublicationFixture() {
  let options = {},
    state = 'claimed',
    version = 1,
    used = 99,
    published = false,
    uploads = 0,
    submits = 0,
    begins = 0,
    finishes = [];
  const calls = [];
  const binding = () => ({
    workspaceId,
    connectionId,
    externalAccountId: '88',
    displayName: 'Privat',
    accountType: 'private',
    status: 'connected',
    generation,
    canPublish: true,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  const installation = () => ({
    phase: 'connected',
    appOrigin: 'https://app.flipbase.de',
    apiUrl: 'https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension',
    secret: 'a'.repeat(64),
    binding: binding(),
  });
  const session = () => ({
    workspaceId,
    connectionId,
    externalAccountId: '88',
    generation,
    expiresAt: currentInstallation.binding.expiresAt,
    canPublish: true,
  });
  let currentInstallation = installation();
  const job = () => {
    const at = new Date().toISOString();
    return {
      id: jobId,
      workspaceId,
      connectionId,
      draftId,
      draftRevision: 4,
      grantGeneration: generation,
      requestedBy: '51000000-0000-4000-8000-000000000001',
      immutableSnapshot: {
        workspaceId,
        connectionId,
        draftId,
        draftRevision: 4,
        grantGeneration: generation,
        externalAccountId: '88',
        content: {
          title: 'Jacke',
          description: 'Vollständiger Testtext',
          priceCents: 1200,
          currency: 'EUR',
          priceType: 'FIXED',
          shippingType: 'pickup',
          shippingPriceCents: null,
          postalCode: '10115',
          categoryId: '153/160/shirts',
          categoryFields: { 'kleidung_herren.condition': 'ok' },
          schemaRevision: 'c'.repeat(64),
        },
        images: [image],
      },
      state,
      version,
      externalId: null,
      providerState: null,
      verifiedAt: null,
      errorCode: state === 'needs_user_action' ? 'quota_exhausted' : null,
      createdAt: at,
      updatedAt: at,
    };
  };
  function reset(next = {}) {
    options = next;
    state = 'claimed';
    version = 1;
    used = next.used ?? 99;
    published = false;
    uploads = 0;
    submits = 0;
    begins = 0;
    finishes = [];
    calls.length = 0;
    currentInstallation = installation();
  }
  async function route(route) {
    const request = route.request();
    const url = new URL(request.url());
    if (
      !['www.kleinanzeigen.de', 'api.flipbase.de', 'app.flipbase.de'].includes(url.hostname) ||
      url.pathname === '/favicon.ico'
    )
      return route.fulfill({ status: 204, body: '' });
    calls.push({ url: url.href, method: request.method() });
    if (url.hostname === 'app.flipbase.de')
      return route.fulfill({
        contentType: 'text/html',
        body: html('Nur synthetischer Extensiontest'),
      });
    if (url.hostname === 'api.flipbase.de') {
      assert.equal(url.pathname, '/functions/v1/kleinanzeigen-local-extension');
      const body = request.postDataJSON();
      calls.at(-1).action = body.action;
      assert.equal(body.workspaceId, workspaceId);
      assert.equal(body.connectionId, connectionId);
      assert.equal(body.generation, generation);
      if (body.action === 'heartbeat') return route.fulfill({ json: session() });
      if (body.action === 'quota_observation')
        return route.fulfill({
          json: {
            ...session(),
            quota: {
              used,
              observedAt: body.quota.observedAt,
              reserved: 0,
              allowed: used < 100,
              reason: used < 100 ? null : 'quota_exhausted',
            },
          },
        });
      if (body.action === 'job_claim') {
        if (used >= 100) state = 'needs_user_action';
        return route.fulfill({
          json: {
            ...job(),
            claimToken: state === 'needs_user_action' ? null : body.claimToken,
            leaseUntil:
              state === 'needs_user_action' ? null : new Date(Date.now() + 120000).toISOString(),
            absoluteExpiresAt:
              state === 'needs_user_action' ? null : new Date(Date.now() + 600000).toISOString(),
          },
        });
      }
      if (body.action === 'job_check') {
        if (state === 'claimed') version++;
        return route.fulfill({
          json: {
            active: state === 'claimed' || state === 'writing',
            generation,
            version,
            leaseUntil: new Date(Date.now() + 120000).toISOString(),
          },
        });
      }
      if (body.action === 'form_schema')
        return route.fulfill({
          json: {
            workspaceId,
            connectionId,
            externalAccountId: '88',
            generation,
            categoryPath: body.schema.categoryPath,
            categoryLabel: body.schema.categoryLabel,
            choices: [],
            schema: body.schema,
            schemaRevision: 'c'.repeat(64),
            observedAt: body.observedAt,
          },
        });
      if (body.action === 'job_photo') {
        assert.equal(body.imageId, imageId);
        return route.fulfill({
          contentType: 'image/png',
          body: options.corruptImage ? Buffer.alloc(bytes.length) : bytes,
          headers: {
            'content-length': String(bytes.length),
            'x-flipbase-workspace-id': workspaceId,
            'x-flipbase-connection-id': connectionId,
            'x-flipbase-job-id': jobId,
            'x-flipbase-image-id': imageId,
            'x-flipbase-image-sha256': image.sha256,
          },
        });
      }
      if (body.action === 'job_begin') {
        assert.equal(state, 'claimed');
        assert.equal(body.expectedVersion, version);
        assert.equal(body.fee.state, 'free');
        assert.equal(used, 99);
        assert.equal(begins, 0);
        begins++;
        state = 'writing';
        version++;
        return route.fulfill({ json: { authorized: true, reason: null, job: job() } });
      }
      if (body.action === 'job_finish') {
        finishes.push(body.result);
        state = body.result.outcome === 'confirmed' ? 'confirmed' : body.result.outcome;
        version++;
        return route.fulfill({ json: job() });
      }
      throw Error('Unerwartete RPC-Aktion ' + body.action);
    }
    if (url.pathname === '/m-einstellungen.html')
      return route.fulfill({
        contentType: 'text/html',
        body: html(
          '<main>Du hast in den letzten 30 Tagen ' + used + ' Anzeigen aufgegeben.</main>',
        ),
      });
    if (url.pathname === '/m-meine-anzeigen.html')
      return route.fulfill({
        contentType: 'text/html',
        body: html(
          '<main>Mein Profil und meine Anzeigen<ul id="my-manageitems-adlist"><li data-testid="ad-card" data-adid="999"><h3><a href="https://www.kleinanzeigen.de/s-anzeige/alt/999-1-2">Anzeige Jacke</a></h3><button>Reservieren</button></li>' +
            (published
              ? '<li data-testid="ad-card" data-adid="1001"><h3><a href="' +
                target +
                '">Anzeige Jacke</a></h3><button>Reservieren</button></li>'
              : '') +
            '</ul><nav aria-label="Seiten-Navigation"><span aria-current="page">Seite 1</span><button disabled>Nächste</button></nav></main>',
        ),
      });
    if (url.pathname === '/p-kategorie-aendern.html')
      return route.fulfill({ contentType: 'text/html', body: category });
    if (url.pathname === '/p-anzeige-aufgeben-schritt2.html')
      return route.fulfill({
        contentType: 'text/html',
        body: form(options.paid === true)
          .replace(
            '>Shirts</button>',
            options.initialWrongCategory ? '>Pullover</button>' : '>Shirts</button>',
          )
          .replace(
            '<h3>Kostenpflichtige Optionen</h3>',
            options.unknownFee
              ? '<p>Unbekannter Zahlungsschritt</p><h3>Kostenpflichtige Optionen</h3>'
              : '<h3>Kostenpflichtige Optionen</h3>',
          ),
      });
    if (url.pathname === '/fixture-upload') {
      assert.equal(request.method(), 'POST');
      assert.equal(
        createHash('sha256').update(request.postDataBuffer()).digest('hex'),
        image.sha256,
      );
      uploads++;
      if (options.externalAfterUpload) used = 100;
      return route.fulfill({
        json: {
          url: 'https://www.kleinanzeigen.de/fixture-image/one.png',
          changedCategory: options.categoryAfterUpload === true,
        },
      });
    }
    if (url.pathname === '/fixture-image/one.png')
      return route.fulfill({ contentType: 'image/png', body: bytes });
    if (url.pathname === '/fixture-submit') {
      assert.equal(request.method(), 'POST');
      const body = request.postDataJSON();
      assert.deepEqual(body, {
        title: 'Jacke',
        description: 'Vollständiger Testtext',
        price: '12',
        postalCode: '10115',
        condition: 'ok',
        images: 1,
        buyNow: false,
        paid: false,
      });
      assert.equal(begins, 1);
      assert.equal(submits, 0);
      assert.equal(used, 99);
      submits++;
      published = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/p-anzeige-aufgeben-schritt3.html')
      return route.fulfill({
        contentType: 'text/html',
        body: html('<a href="' + target + '">Anzeige ansehen</a>'),
      });
    throw Error('Unbekannte lokale Anbieterroute ' + url.pathname);
  }
  async function prepare(worker) {
    const record = {
      workspaceId,
      connectionId,
      generation,
      jobId,
      appOrigin: currentInstallation.appOrigin,
      claimToken: 'b'.repeat(64),
      attemptId: crypto.randomUUID(),
      phase: 'claiming',
      installation: currentInstallation,
    };
    await worker.evaluate(
      async ({ installation, record, key }) => {
        await chrome.storage.local.clear();
        await chrome.storage.local.set({
          kleinanzeigen_local_installation: installation,
          kleinanzeigen_publication_attempts: { [key]: record },
          pending_kleinanzeigen_listing: {
            title: 'Darf nicht übernommen werden',
            description: 'Alt',
            price: 99,
          },
          pending_kleinanzeigen_timestamp: Date.now(),
        });
      },
      { installation: currentInstallation, record, key: workspaceId + ':9:12' },
    );
  }
  return {
    route,
    reset,
    prepare,
    get state() {
      return state;
    },
    get begins() {
      return begins;
    },
    get submits() {
      return submits;
    },
    get uploads() {
      return uploads;
    },
    get finishes() {
      return finishes;
    },
    calls,
  };
}

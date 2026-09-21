(function () {
  var ENDPOINT = 'https://api.flipbase.de/functions/v1/beta-application';
  var TEXTS = {
    error: {
      de: 'Das hat nicht geklappt. Bitte später erneut versuchen.',
      en: 'That did not work. Please try again later.',
    },
    throttled: {
      de: 'Zu viele Versuche. Bitte in einer Stunde erneut versuchen.',
      en: 'Too many attempts. Please try again in an hour.',
    },
  };

  function announce(field, kind) {
    // <html lang> ist statisch "de" - die Sprachumschaltung laeuft rein
    // ueber CSS (body:has(#lang-toggle:checked)), nicht ueber dieses
    // Attribut. Ein Skript-seitiger Sprachentscheid wuerde deshalb immer
    // "de" treffen, egal welche Sprache sichtbar ist. Darum wie der Rest
    // der Seite: beide Fassungen ausgeben und das vorhandene CSS die
    // passende anzeigen lassen.
    // Erst leeren, dann per createElement/textContent (kein innerHTML)
    // neu aufbauen - und komplett ersetzen statt nur den Text zu aendern,
    // damit die Live-Region (role="status", aria-live="polite") die
    // Aenderung zuverlaessig ansagt.
    field.textContent = '';
    var de = document.createElement('span');
    de.className = 'lang-de';
    de.textContent = TEXTS[kind].de;
    var en = document.createElement('span');
    en.className = 'lang-en';
    en.lang = 'en';
    en.textContent = TEXTS[kind].en;
    field.append(de, en);
  }

  var successDialog = document.getElementById('beta-success-dialog');
  var successContent = document.getElementById('beta-success-content');
  var existingContent = document.getElementById('beta-existing-content');
  var successEmail = document.getElementById('beta-success-email');
  var existingEmail = document.getElementById('beta-existing-email');
  var receiptSent = document.getElementById('beta-success-receipt-sent');
  var receiptFailed = document.getElementById('beta-success-receipt-failed');
  var dialogCloseButton = document.getElementById('beta-success-close');
  var dialogConfirmButton = document.getElementById('beta-success-confirm');
  var pageRegions = Array.prototype.slice.call(
    document.querySelectorAll('body > header, body > main, body > footer'),
  );
  var returnFocusTo = null;

  function closeSuccessDialog() {
    if (successDialog.hidden) return;
    successDialog.hidden = true;
    document.body.classList.remove('beta-dialog-open');
    pageRegions.forEach(function (region) {
      region.inert = false;
    });
    if (returnFocusTo) returnFocusTo.focus();
  }

  function showSuccessDialog(email, receiptEmailSent, submitButton) {
    returnFocusTo = submitButton;
    successContent.hidden = false;
    existingContent.hidden = true;
    successDialog.setAttribute('aria-labelledby', 'beta-success-title');
    successDialog.setAttribute('aria-describedby', 'beta-success-description beta-success-receipt');
    successEmail.textContent = email;
    receiptSent.hidden = !receiptEmailSent;
    receiptFailed.hidden = receiptEmailSent;
    successDialog.hidden = false;
    document.body.classList.add('beta-dialog-open');
    pageRegions.forEach(function (region) {
      region.inert = true;
    });
    dialogCloseButton.focus();
  }

  function showExistingDialog(email, submitButton) {
    returnFocusTo = submitButton;
    successContent.hidden = true;
    existingContent.hidden = false;
    successDialog.setAttribute('aria-labelledby', 'beta-existing-title');
    successDialog.setAttribute('aria-describedby', 'beta-existing-description');
    existingEmail.textContent = email;
    successDialog.hidden = false;
    document.body.classList.add('beta-dialog-open');
    pageRegions.forEach(function (region) {
      region.inert = true;
    });
    dialogCloseButton.focus();
  }

  dialogCloseButton.addEventListener('click', closeSuccessDialog);
  dialogConfirmButton.addEventListener('click', closeSuccessDialog);
  successDialog.addEventListener('click', function (event) {
    if (event.target === successDialog) closeSuccessDialog();
  });
  document.addEventListener('keydown', function (event) {
    if (successDialog.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSuccessDialog();
      return;
    }
    if (event.key !== 'Tab') return;

    var focusable = [dialogCloseButton, dialogConfirmButton];
    var currentIndex = focusable.indexOf(document.activeElement);
    var nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= focusable.length) {
      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
    }
  });

  var prefix = 'zweit';
  var form = document.getElementById(prefix + '-bewerbung-form');
  var message = document.getElementById(prefix + '-bewerbung-meldung');

  function setSubmitLoading(button, loading) {
    button.disabled = loading;
    if (loading) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
    button.querySelector('[data-beta-submit-idle]').hidden = loading;
    button.querySelector('[data-beta-submit-loading]').hidden = !loading;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var button = form.querySelector('button[type="submit"]');
    // Schon gesperrt: ein zweites, bereits in der Warteschlange
    // stehendes submit-Ereignis darf nicht nochmal senden.
    if (button.disabled) return;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setSubmitLoading(button, true);
    var submittedEmail = document.getElementById(prefix + '-bewerbung-email').value.trim();

    // Ohne Zeitgrenze wuerde ein ausbleibender Server den Knopf fuer
    // immer gesperrt lassen (weder then, noch catch, noch finally
    // feuert). Nach 15 Sekunden abbrechen; der Abbruch landet im catch.
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 15000);

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        firstName: document.getElementById(prefix + '-bewerbung-vorname').value,
        lastName: document.getElementById(prefix + '-bewerbung-nachname').value,
        email: submittedEmail,
        consent: document.getElementById(prefix + '-bewerbung-einwilligung').checked,
      }),
    })
      .then(function (response) {
        if (response.ok) {
          return response.json().then(function (payload) {
            message.textContent = '';
            showSuccessDialog(submittedEmail, payload.receiptEmailSent === true, button);
            form.reset();
          });
        } else if (response.status === 409) {
          return response.json().then(function (payload) {
            var existingApplication =
              payload.error === 'application_existing' || payload.error === 'application_exists';
            if (existingApplication) {
              message.textContent = '';
              showExistingDialog(submittedEmail, button);
              return;
            }
            announce(message, 'error');
          });
        } else {
          announce(message, response.status === 429 ? 'throttled' : 'error');
        }
      })
      .catch(function () {
        announce(message, 'error');
      })
      .finally(function () {
        clearTimeout(timer);
        setSubmitLoading(button, false);
      });
  });
})();

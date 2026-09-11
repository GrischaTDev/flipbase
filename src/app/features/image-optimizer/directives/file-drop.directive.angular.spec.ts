import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { FileDropDirective, splitImageFiles } from './file-drop.directive';

function file(name: string, type: string): File {
  return new File([''], name, { type });
}

/**
 * Baut ein Drag-Ereignis mit einer minimalen `dataTransfer`-Attrappe.
 *
 * jsdom kennt `DataTransfer` nicht, deshalb wird hier ein einfaches Objekt
 * mit `types: ['Files']` angehaengt - genau das, worauf `carriesFiles` prueft.
 * Ueber `types` laesst sich zusaetzlich die interne Marke einschmuggeln, wie
 * sie ein in der Seite begonnener Ziehvorgang tragen wuerde.
 */
function createFileEvent(
  type: string,
  files: readonly File[] = [],
  types: readonly string[] = ['Files'],
): Event {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: { types, files },
  });
  return event;
}

const INTERNAL_TYPES = ['Files', 'application/x-flipbase-internal'];

/**
 * Erstellt die Direktive ohne Umweg ueber Host-Komponente und Template.
 *
 * `[disabled]="..."` im Template an ein Signal-`input()` zu binden, scheitert
 * in diesem Vitest-Setup: Ohne den ngtsc-Kompilierungsschritt (hier laeuft
 * nur eine reine TypeScript-Transformation) findet der Laufzeit-JIT-Compiler
 * keine Eingaben, die per `input()` statt per `@Input()`-Dekorator deklariert
 * sind, und Angular meldet NG0303. Deshalb wird die Direktive direkt erzeugt
 * und mit echten Methodenaufrufen angesteuert - das trifft denselben Code,
 * den auch die `host`-Bindings im echten Betrieb aufrufen.
 */
function createDirective(): FileDropDirective {
  return TestBed.runInInjectionContext(() => new FileDropDirective());
}

/**
 * Setzt den Wert eines Signal-`input()` von aussen.
 *
 * `InputSignal` hat bewusst kein oeffentliches `set()` - nur Angular selbst
 * darf Eingaben schreiben. Fuer den Test wird deshalb der interne
 * Signal-Knoten (erreichbar ueber das Symbol, mit dem jedes Signal seinen
 * reaktiven Zustand traegt) direkt aktualisiert.
 */
function setDisabled(directive: FileDropDirective, value: boolean): void {
  const signalSymbol = Object.getOwnPropertySymbols(directive.disabled).find(
    (symbol) => symbol.toString() === 'Symbol(SIGNAL)',
  );
  if (!signalSymbol) throw new Error('Signal-Knoten von `disabled` nicht gefunden.');
  (directive.disabled as unknown as Record<symbol, { value: boolean }>)[signalSymbol].value = value;
}

describe('Dateien sortieren', () => {
  it('trennt Bilder von allem anderen', () => {
    const result = splitImageFiles([
      file('a.jpg', 'image/jpeg'),
      file('b.pdf', 'application/pdf'),
      file('c.png', 'image/png'),
      file('d.txt', 'text/plain'),
    ]);

    expect(result.images.map((f) => f.name)).toEqual(['a.jpg', 'c.png']);
    expect(result.skipped).toBe(2);
  });

  it('meldet null uebersprungene, wenn alles Bilder sind', () => {
    expect(splitImageFiles([file('a.jpg', 'image/jpeg')]).skipped).toBe(0);
  });

  it('behandelt eine leere Liste', () => {
    const result = splitImageFiles([]);

    expect(result.images).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('erkennt HEIC am Dateinamen, obwohl der Browser keinen Typ meldet', () => {
    // HEIC wird bewusst durchgelassen: Der Nutzer soll die verstaendliche
    // Meldung am Bild sehen, nicht ein stilles Verschwinden erleben.
    const result = splitImageFiles([file('foto.heic', '')]);

    expect(result.images.map((f) => f.name)).toEqual(['foto.heic']);
    expect(result.skipped).toBe(0);
  });
});

describe('FileDropDirective', () => {
  it('verhindert die Browser-Standardaktion bei dragover auch waehrend eines laufenden Exports', () => {
    // Regressionsschutz: Ohne `preventDefault` waehrend `disabled` navigiert
    // der Browser weg und ein laufender Export geht verloren.
    const directive = createDirective();
    setDisabled(directive, true);
    const event = createFileEvent('dragover');
    const preventDefault = vi.spyOn(event, 'preventDefault');

    directive.onDragOver(event as DragEvent);

    expect(preventDefault).toHaveBeenCalled();
  });

  it('verhindert die Browser-Standardaktion bei dragover auch ausserhalb der eigenen Box im DOM', () => {
    // Regressionsschutz fuer die Bindung auf `document`: Die Direktive sitzt
    // in einem zentrierten Bereich der Seite und deckt nicht die ganze
    // Flaeche ab. Ohne die Bindung auf `document` wuerde ein Ablegen ausserhalb
    // dieser Box nie preventDefault() ausloesen, und der Browser wuerde die
    // Seite verlassen, um die Datei selbst zu oeffnen.
    const directive = createDirective();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    const listener = (event: Event) => directive.onDragOver(event as DragEvent);
    document.addEventListener('dragover', listener);

    try {
      const event = createFileEvent('dragover');
      const preventDefault = vi.spyOn(event, 'preventDefault');

      outside.dispatchEvent(event);

      expect(preventDefault).toHaveBeenCalled();
    } finally {
      document.removeEventListener('dragover', listener);
      outside.remove();
    }
  });

  it('verhindert die Browser-Standardaktion bei drop auch waehrend eines laufenden Exports', () => {
    const directive = createDirective();
    setDisabled(directive, true);
    const event = createFileEvent('drop', [file('a.jpg', 'image/jpeg')]);
    const preventDefault = vi.spyOn(event, 'preventDefault');

    directive.onDrop(event as DragEvent);

    expect(preventDefault).toHaveBeenCalled();
  });

  it('meldet abgelegte Dateien nicht, waehrend die Ablageflaeche deaktiviert ist', () => {
    const directive = createDirective();
    const filesDropped = vi.fn();
    directive.filesDropped.subscribe(filesDropped);
    setDisabled(directive, true);

    directive.onDrop(createFileEvent('drop', [file('a.jpg', 'image/jpeg')]) as DragEvent);

    expect(filesDropped).not.toHaveBeenCalled();
  });

  it('haelt die Ablageflaeche aktiv, solange ein verschachteltes dragenter noch offen ist', () => {
    const directive = createDirective();
    const dragActiveChanged = vi.fn();
    directive.dragActiveChanged.subscribe(dragActiveChanged);

    directive.onDragEnter(createFileEvent('dragenter') as DragEvent);
    directive.onDragEnter(createFileEvent('dragenter') as DragEvent);
    directive.onDragLeave(createFileEvent('dragleave') as DragEvent);

    expect(dragActiveChanged).toHaveBeenCalledWith(true);
    expect(dragActiveChanged).not.toHaveBeenCalledWith(false);

    directive.onDragLeave(createFileEvent('dragleave') as DragEvent);

    expect(dragActiveChanged).toHaveBeenCalledWith(false);
  });

  it('laesst den Tiefenzaehler durch ein verfruehtes dragleave nicht negativ werden', () => {
    const directive = createDirective();
    const dragActiveChanged = vi.fn();
    directive.dragActiveChanged.subscribe(dragActiveChanged);

    directive.onDragLeave(createFileEvent('dragleave') as DragEvent);
    directive.onDragEnter(createFileEvent('dragenter') as DragEvent);

    expect(dragActiveChanged).toHaveBeenCalledWith(true);
  });

  it('setzt den Tiefenzaehler bei drop zurueck, damit ein folgendes dragenter wieder aktiviert', () => {
    const directive = createDirective();
    const dragActiveChanged = vi.fn();
    directive.dragActiveChanged.subscribe(dragActiveChanged);

    directive.onDragEnter(createFileEvent('dragenter') as DragEvent);
    directive.onDragEnter(createFileEvent('dragenter') as DragEvent);
    directive.onDrop(createFileEvent('drop', [file('a.jpg', 'image/jpeg')]) as DragEvent);
    dragActiveChanged.mockClear();

    directive.onDragEnter(createFileEvent('dragenter') as DragEvent);

    expect(dragActiveChanged).toHaveBeenCalledWith(true);
  });

  describe('Ziehen, das in der Seite beginnt', () => {
    it('schreibt die interne Marke in den Ziehvorgang', () => {
      // Die Marke haengt am Ziehvorgang selbst (siehe Kommentar an
      // `onDragStart`), nicht an einem Feld der Direktive - deshalb wird hier
      // direkt geprueft, dass `setData` mit dem richtigen Typ aufgerufen wird.
      const directive = createDirective();
      const setData = vi.fn();
      const event = { dataTransfer: { setData } } as unknown as DragEvent;

      directive.onDragStart(event);

      expect(setData).toHaveBeenCalledWith('application/x-flipbase-internal', '1');
    });

    it('haelt ein internes Ziehen nicht fuer einen Datei-Drop, wehrt aber die Browser-Standardaktion ab', () => {
      // Chrome bietet ein gezogenes Vorschaubild als Datei an. Ohne diese
      // Sperre erschien "Bilder hier ablegen" und das Bild kam doppelt hinzu.
      // `preventDefault` muss trotzdem greifen, sonst navigiert Firefox zum
      // gezogenen Bild.
      const directive = createDirective();
      const active: boolean[] = [];
      const dropped: (readonly File[])[] = [];
      directive.dragActiveChanged.subscribe((value) => active.push(value));
      directive.filesDropped.subscribe((files) => dropped.push(files));

      const overEvent = createFileEvent('dragover', [], INTERNAL_TYPES);
      directive.onDragOver(overEvent as DragEvent);
      const dropEvent = createFileEvent('drop', [file('a.jpg', 'image/jpeg')], INTERNAL_TYPES);
      directive.onDrop(dropEvent as DragEvent);

      expect(active).not.toContain(true);
      expect(dropped).toEqual([]);
      expect((overEvent as DragEvent).defaultPrevented).toBe(true);
      expect((dropEvent as DragEvent).defaultPrevented).toBe(true);
    });

    it('haengt nicht fest, wenn dragend und drop nach einem internen Ziehen ausbleiben', () => {
      // Das ist genau das Szenario, das den Fehler ausgemacht hat: Entfernt
      // Angular den gezogenen Knoten waehrend des Ziehens aus dem DOM, feuert
      // `dragend` nie auf `document`; endet das Ziehen ausserhalb des
      // Fensters, bleibt auch `drop` aus. Eine Marke an der Direktive bliebe
      // in diesem Fall auf `true` haengen und der naechste echte Datei-Drop
      // vom Schreibtisch wuerde faelschlich als intern behandelt - der
      // Browser wuerde die Datei selbst oeffnen und die Sitzung waere weg.
      const directive = createDirective();
      const active: boolean[] = [];
      const dropped: (readonly File[])[] = [];
      directive.dragActiveChanged.subscribe((value) => active.push(value));
      directive.filesDropped.subscribe((files) => dropped.push(files));

      directive.onDragStart({ dataTransfer: { setData: vi.fn() } } as unknown as DragEvent);
      // Weder dragend noch drop folgen - der Knoten ist bereits aus dem DOM.

      const photo = file('a.jpg', 'image/jpeg');
      const enterEvent = createFileEvent('dragenter');
      directive.onDragEnter(enterEvent as DragEvent);
      const dropEvent = createFileEvent('drop', [photo]);
      directive.onDrop(dropEvent as DragEvent);

      expect(active).toContain(true);
      expect((enterEvent as DragEvent).defaultPrevented).toBe(true);
      expect((dropEvent as DragEvent).defaultPrevented).toBe(true);
      expect(dropped).toEqual([[photo]]);
    });
  });
});

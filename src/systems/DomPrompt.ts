/** Styled text-input modal (index.html #modal). Works in desktop browsers and the Android WebView. */
export function promptText(title: string, initial: string, maxLength = 32): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal')!;
    const input = document.getElementById('modal-input') as HTMLInputElement;
    const ok = document.getElementById('modal-ok')!;
    const cancel = document.getElementById('modal-cancel')!;
    document.getElementById('modal-title')!.textContent = title;
    input.value = initial;
    input.maxLength = maxLength;
    modal.classList.add('show');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);

    const close = (value: string | null): void => {
      modal.classList.remove('show');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      input.blur();
      resolve(value);
    };
    const onOk = (): void => close(input.value.trim());
    const onCancel = (): void => close(null);
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation();
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
}

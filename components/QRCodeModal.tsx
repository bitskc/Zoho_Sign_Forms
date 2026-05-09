import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  formName: string;
  darkMode: boolean;
}

const COLOR_PRESETS = [
  { name: 'Classic', fg: '#000000', bg: '#FFFFFF' },
  { name: 'Blue', fg: '#1E40AF', bg: '#DBEAFE' },
  { name: 'Green', fg: '#166534', bg: '#DCFCE7' },
  { name: 'Purple', fg: '#7C3AED', bg: '#EDE9FE' },
  { name: 'Dark', fg: '#FFFFFF', bg: '#1F2937' },
];

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, url, formName, darkMode }) => {
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const qrRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // On open: save focus origin and focus close button; mark sibling elements inert so
  // screen readers cannot reach background content while the modal is open.
  // We use `inert` on the direct children of #root that are NOT the modal portal container
  // (the modal renders via createPortal into document.body, outside #root entirely).
  // On close: restore focus and remove inert.
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      // Apply `inert` to all direct children of <body> except the portal container
      // (which is appended to body by createPortal). The portal node is the last child.
      const bodyChildren = Array.from(document.body.children);
      bodyChildren.forEach((el) => {
        if (el !== modalRef.current?.closest('[data-modal-portal]')) {
          (el as HTMLElement).setAttribute('inert', '');
        }
      });
      // Defer focus to ensure the modal is in the DOM
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else {
      // Remove inert from all body children
      Array.from(document.body.children).forEach((el) => {
        (el as HTMLElement).removeAttribute('inert');
      });
      const prev = previousFocusRef.current as HTMLElement | null;
      if (prev?.focus) prev.focus();
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const trapFocus = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }
    if (e.key !== 'Tab') return;

    const modal = modalRef.current;
    if (!modal) return;
    const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [handleClose]);

  if (!isOpen) return null;

  const applyPreset = (index: number) => {
    setSelectedPreset(index);
    setFgColor(COLOR_PRESETS[index].fg);
    setBgColor(COLOR_PRESETS[index].bg);
  };

  const downloadQRCode = () => {
    if (!qrRef.current) return;

    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 1024;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);

        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `${formName.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(url);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-modal-portal=""
      // The modal renders via createPortal into document.body, outside #root.
      // Background siblings are marked inert (see useEffect above) for AT compatibility.
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal dialog */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-modal-title"
        className={`relative z-10 w-full max-w-md mx-4 rounded-2xl shadow-2xl ${darkMode ? 'bg-slate-800' : 'bg-white'}`}
        onKeyDown={trapFocus}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <h3
            id="qr-modal-title"
            className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}
          >
            QR Code for {formName}
          </h3>
          <button
            ref={closeButtonRef}
            onClick={handleClose}
            aria-label="Close QR code modal"
            className={`p-1 rounded-full focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
          >
            <svg className="w-5 h-5" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* QR Code Display */}
          <div
            ref={qrRef}
            className="flex justify-center mb-6"
          >
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: bgColor }}
            >
              <QRCodeSVG
                value={url}
                size={200}
                fgColor={fgColor}
                bgColor={bgColor}
                level="H"
                includeMargin={false}
                aria-label={`QR code linking to ${url}`}
              />
            </div>
          </div>

          {/* Text alternative for QR code — P4-09 */}
          <div className={`mb-4 p-3 rounded-lg ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
            <div className="flex items-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm truncate flex-1 underline focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}
              >
                Direct link: {url}
              </a>
              <button
                onClick={copyToClipboard}
                aria-label="Copy form URL to clipboard"
                className={`p-1.5 rounded focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
              >
                <svg className="w-4 h-4" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Color Presets */}
          <div className="mb-4">
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Color Theme
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_PRESETS.map((preset, index) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(index)}
                  aria-pressed={selectedPreset === index}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                    selectedPreset === index
                      ? 'ring-2 ring-blue-500 ring-offset-2'
                      : ''
                  }`}
                  style={{
                    backgroundColor: preset.bg,
                    color: preset.fg,
                    border: `1px solid ${preset.fg}20`
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Colors */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <label
                htmlFor="qr-fg-color"
                className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
              >
                Foreground
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="qr-fg-color"
                  type="color"
                  value={fgColor}
                  onChange={(e) => { setFgColor(e.target.value); setSelectedPreset(-1); }}
                  className="w-8 h-8 rounded cursor-pointer border-0 focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="QR code foreground color picker"
                />
                <input
                  type="text"
                  value={fgColor}
                  onChange={(e) => { setFgColor(e.target.value); setSelectedPreset(-1); }}
                  aria-label="QR code foreground color hex value"
                  className={`flex-1 px-2 py-1 text-xs rounded focus-visible:ring-2 focus-visible:ring-blue-500 ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700'}`}
                />
              </div>
            </div>
            <div className="flex-1">
              <label
                htmlFor="qr-bg-color"
                className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
              >
                Background
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="qr-bg-color"
                  type="color"
                  value={bgColor}
                  onChange={(e) => { setBgColor(e.target.value); setSelectedPreset(-1); }}
                  className="w-8 h-8 rounded cursor-pointer border-0 focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="QR code background color picker"
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => { setBgColor(e.target.value); setSelectedPreset(-1); }}
                  aria-label="QR code background color hex value"
                  className={`flex-1 px-2 py-1 text-xs rounded focus-visible:ring-2 focus-visible:ring-blue-500 ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700'}`}
                />
              </div>
            </div>
          </div>

          {/* Download Button */}
          <button
            onClick={downloadQRCode}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <svg className="w-5 h-5" aria-hidden="true" focusable="false" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PNG (1024×1024)
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default QRCodeModal;

export const CHESS_PIECES = {
    // White Pieces - Modern Minimalist Style with subtle gradients/shadows
    wP: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="whiteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#e2e8f0;stop-opacity:1" />
                </linearGradient>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="1" />
                    <feOffset dx="0.5" dy="1" />
                    <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
                    <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>
            <path d="M22.5 10c-3 0-4.5 2-4.5 4.5 0 2 1 3.5 1.5 4.5-2.5 1-5.5 4-5.5 11h17c0-7-3-10-5.5-11 .5-1 1.5-2.5 1.5-4.5 0-2.5-1.5-4.5-4.5-4.5z" fill="url(#whiteGrad)" filter="url(#shadow)" stroke="#94a3b8" stroke-width="0.5"/>
         </svg>`,
    wN: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 30c0-10 8-15 10-20 0 0 2 0 3 2s1 5-1 7c4 2 6 8 5 11H15z" fill="url(#whiteGrad)" filter="url(#shadow)" stroke="#94a3b8" stroke-width="0.5"/>
            <path d="M25 10c2 0 4 2 4 4s-2 4-4 4-4-2-4-4 2-4 4-4z" fill="#cbd5e1" opacity="0.5"/>
         </svg>`,
    wB: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 8c-4 0-6 4-6 10 0 4 2 6 3 8-3 1-6 4-6 10h18c0-6-3-9-6-10 1-2 3-4 3-8 0-6-2-10-6-10z" fill="url(#whiteGrad)" filter="url(#shadow)" stroke="#94a3b8" stroke-width="0.5"/>
            <circle cx="22.5" cy="8" r="1.5" fill="#cbd5e1"/>
         </svg>`,
    wR: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 36h21v-4H12v4zm1-4l1-14h15l1 14H13zm-1-14V10h3v4h4v-4h3v4h4v-4h3v8H12z" fill="url(#whiteGrad)" filter="url(#shadow)" stroke="#94a3b8" stroke-width="0.5"/>
         </svg>`,
    wQ: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 8l3 8 8-2-4 8 7 3-8 3 2 8-8-4-8 4 2-8-8-3 7-3-4-8 8 2 3-8z" fill="url(#whiteGrad)" filter="url(#shadow)" stroke="#94a3b8" stroke-width="0.5"/>
         </svg>`,
    wK: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 6v4m-2-2h4m-2 4s5 3 5 10-5 12-5 12-5-5-5-12 5-10 5-10zm-10 22c4 3 16 3 20 0v-6s3-4 3-8-4-6-8-4l-5 4-5-4c-4-2-8 0-8 4s3 8 3 8v6z" fill="url(#whiteGrad)" filter="url(#shadow)" stroke="#94a3b8" stroke-width="0.5"/>
         </svg>`,

    // Black Pieces - Modern Minimalist Style with Luxury Dark Gradients
    bP: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="blackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#334155;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
                </linearGradient>
            </defs>
            <path d="M22.5 10c-3 0-4.5 2-4.5 4.5 0 2 1 3.5 1.5 4.5-2.5 1-5.5 4-5.5 11h17c0-7-3-10-5.5-11 .5-1 1.5-2.5 1.5-4.5 0-2.5-1.5-4.5-4.5-4.5z" fill="url(#blackGrad)" filter="url(#shadow)" stroke="#475569" stroke-width="0.5"/>
         </svg>`,
    bN: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 30c0-10 8-15 10-20 0 0 2 0 3 2s1 5-1 7c4 2 6 8 5 11H15z" fill="url(#blackGrad)" filter="url(#shadow)" stroke="#475569" stroke-width="0.5"/>
            <path d="M25 10c2 0 4 2 4 4s-2 4-4 4-4-2-4-4 2-4 4-4z" fill="#1e293b" opacity="0.5"/>
         </svg>`,
    bB: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 8c-4 0-6 4-6 10 0 4 2 6 3 8-3 1-6 4-6 10h18c0-6-3-9-6-10 1-2 3-4 3-8 0-6-2-10-6-10z" fill="url(#blackGrad)" filter="url(#shadow)" stroke="#475569" stroke-width="0.5"/>
            <circle cx="22.5" cy="8" r="1.5" fill="#1e293b"/>
         </svg>`,
    bR: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 36h21v-4H12v4zm1-4l1-14h15l1 14H13zm-1-14V10h3v4h4v-4h3v4h4v-4h3v8H12z" fill="url(#blackGrad)" filter="url(#shadow)" stroke="#475569" stroke-width="0.5"/>
         </svg>`,
    bQ: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 8l3 8 8-2-4 8 7 3-8 3 2 8-8-4-8 4 2-8-8-3 7-3-4-8 8 2 3-8z" fill="url(#blackGrad)" filter="url(#shadow)" stroke="#475569" stroke-width="0.5"/>
         </svg>`,
    bK: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 6v4m-2-2h4m-2 4s5 3 5 10-5 12-5 12-5-5-5-12 5-10 5-10zm-10 22c4 3 16 3 20 0v-6s3-4 3-8-4-6-8-4l-5 4-5-4c-4-2-8 0-8 4s3 8 3 8v6z" fill="url(#blackGrad)" filter="url(#shadow)" stroke="#475569" stroke-width="0.5"/>
         </svg>`
};

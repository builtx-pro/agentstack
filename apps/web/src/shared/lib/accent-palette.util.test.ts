import {describe,it,expect} from 'vitest';
import {accentPalette,contrastRatio,normalizeAccent,ACCENT_PRESETS} from './accent-palette.util';
describe('personal accent palette',()=>{
 it('accepts only complete RGB colors and provides a safe default',()=>{expect(normalizeAccent('#Ab12Ef')).toBe('#ab12ef');for(const value of ['red','#fff','url(x)','#12345678',''])expect(normalizeAccent(value)).toBe('#7950f2')});
 it('keeps button backgrounds readable against white for every preset and extreme color',()=>{for(const color of [...ACCENT_PRESETS.map(p=>p.color),'#ffffff','#ffff00','#00ff00','#000000']){const shades=accentPalette(color);expect(shades).toHaveLength(10);expect(contrastRatio(shades[6],'#ffffff')).toBeGreaterThanOrEqual(4.5);expect(contrastRatio(shades[8],shades[0])).toBeGreaterThanOrEqual(4.5);expect(contrastRatio(shades[2],'#171e2d')).toBeGreaterThanOrEqual(4.5);for(const shade of shades)expect(shade).toMatch(/^#[a-f0-9]{6}$/)}});
 it('preserves recognizable chosen hue and does not replace semantic palettes',()=>{const blue=accentPalette('#228be6');expect(blue[6]).not.toBe(accentPalette('#e64980')[6]);expect(contrastRatio('#000000','#ffffff')).toBe(21)});
});

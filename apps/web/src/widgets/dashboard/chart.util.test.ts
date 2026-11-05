import {describe,it,expect} from 'vitest';
import {chartPoints,chartMarker} from './chart.util';
describe('a new project progress chart',()=>{it('renders an actual centered marker for a single observation',()=>{expect(chartMarker([{total:4,done:1}],'done')).toEqual({x:300,y:125});expect(chartPoints([{total:4,done:1}],'done')).toBe('300,125');});it('keeps empty history explicit',()=>{expect(chartMarker([],'done')).toBeUndefined();});});

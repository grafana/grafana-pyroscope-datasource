import React from 'react';
import './.config/jest-setup';
import { matchers } from './src/test/matchers';
import { MessageChannel } from 'worker_threads';

global.React = React;

// MessageChannel is used by @rc-component/select (and other libs) but is not
// in jsdom. Use Node's native implementation from worker_threads.
if (!global.MessageChannel) {
  global.MessageChannel = MessageChannel;
}

const mockIntersectionObserver = jest.fn().mockImplementation((callback) => ({
  observe: jest.fn().mockImplementation((elem) => {
    callback([{ target: elem, isIntersecting: true }]);
  }),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
global.IntersectionObserver = mockIntersectionObserver;

// ResizeObserver is used by @rc-component/* (dropdowns, tooltips) but not in jsdom
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// document.fonts is used by Monaco's onMount handler but not in jsdom
Object.defineProperty(document, 'fonts', {
  value: {
    ready: Promise.resolve(),
    load: jest.fn(() => Promise.resolve([])),
    check: jest.fn(() => true),
  },
  writable: true,
});

// canvas.getContext is used by Monaco for text measurement but not in jsdom
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  measureText: jest.fn(() => ({ width: 0 })),
  fillText: jest.fn(),
  clearRect: jest.fn(),
  fillRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  scale: jest.fn(),
  translate: jest.fn(),
  drawImage: jest.fn(),
}));

expect.extend(matchers);

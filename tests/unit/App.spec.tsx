import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/src/App';

describe('App shell', () => {
  it('renders the CAD UI chrome', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'CAD UI' })).toBeInTheDocument();
    expect(screen.getByText('No drawing loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open DWG' })).toBeDisabled();
  });
});
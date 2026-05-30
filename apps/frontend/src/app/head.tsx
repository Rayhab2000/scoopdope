import React from 'react';
import { headers } from 'next/headers';

export default function Head() {
  const h = headers();
  const nonce = h.get('x-nonce') || undefined;

  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {nonce ? <meta property="csp-nonce" content={nonce} /> : null}
    </>
  );
}

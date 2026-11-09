// Primality test off the main thread, with the very same code as `node exhibits/2-prime/verify.mjs`.
import { isProbablePrime } from '../exhibits/2-prime/verify.mjs';

onmessage = ({ data }) => {
  const result = isProbablePrime(BigInt(data), (stage) => postMessage({ stage }));
  postMessage({ result });
};

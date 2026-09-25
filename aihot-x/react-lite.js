/* ============ React 18 通过 esm.sh 加载 ============ */
/* minis:// 下不能用 fetch()，但 <script type="module"> 的 import 走的是
   模块加载器（不是 fetch API），实测可用。 */

import React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';

export { React, createRoot };

/* h = React.createElement 的简写 */
export const h = React.createElement;

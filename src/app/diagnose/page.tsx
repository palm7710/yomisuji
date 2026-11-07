import type { Metadata } from 'next';
import { Picker } from './Picker';

export const metadata: Metadata = { title: '本を選ぶ｜読み筋診断（仮）' };

export default function DiagnosePage() {
  return <Picker />;
}

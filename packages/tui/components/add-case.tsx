import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { addCase } from '../api.js';

interface AddCaseProps {
  onDone: () => void;
  onRefresh: () => void;
}

type Field = 'url' | 'courtId' | 'courtType' | 'caseNumber';
const FIELDS: { key: Field; label: string; required: boolean }[] = [
  { key: 'url', label: 'URL карточки дела', required: true },
  { key: 'courtId', label: 'Код суда (subdomain)', required: true },
  { key: 'courtType', label: 'Тип суда (district/appeal/cassation/magistrate)', required: true },
  { key: 'caseNumber', label: 'Номер дела', required: true },
];

export default function AddCase({ onDone, onRefresh }: AddCaseProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldIdx, setFieldIdx] = useState(0);
  const [status, setStatus] = useState<'editing' | 'sending' | 'done' | 'error'>('editing');
  const [errorMsg, setErrorMsg] = useState('');

  const current = FIELDS[fieldIdx];

  const submit = useCallback(() => {
    setStatus('sending');
    addCase({
      url: values['url'] ?? '',
      courtId: values['courtId'] ?? '',
      courtType: values['courtType'] ?? '',
      caseNumber: values['caseNumber'] ?? '',
    })
      .then(() => {
        setStatus('done');
        onRefresh();
      })
      .catch((err: Error) => {
        setStatus('error');
        setErrorMsg(err.message);
      });
  }, [values, onRefresh]);

  useInput((input, key) => {
    if (key.escape) { onDone(); return; }
    if (status === 'done' || status === 'error') { onDone(); return; }

    // Navigation between fields
    if (key.tab && !key.shift) {
      setFieldIdx(i => Math.min(FIELDS.length - 1, i + 1));
      return;
    }
    if (key.tab && key.shift) {
      setFieldIdx(i => Math.max(0, i - 1));
      return;
    }

    // Enter = submit on last field
    if (key.return) {
      if (fieldIdx < FIELDS.length - 1) {
        setFieldIdx(i => i + 1);
      } else {
        submit();
      }
      return;
    }

    // Text input for current field
    if (input.length === 1 && !key.ctrl) {
      setValues(v => ({ ...v, [current.key]: (v[current.key] ?? '') + input }));
      return;
    }
    if (key.backspace || key.delete) {
      setValues(v => ({ ...v, [current.key]: (v[current.key] ?? '').slice(0, -1) }));
      return;
    }
    if (key.leftArrow) {
      setFieldIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.rightArrow) {
      setFieldIdx(i => Math.min(FIELDS.length - 1, i + 1));
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="single">
        <Text bold> Добавить дело в мониторинг</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {FIELDS.map((f, i) => {
          const active = i === fieldIdx && status === 'editing';
          const val = values[f.key] ?? '';
          return (
            <Box key={f.key} marginBottom={1}>
              <Box width={42}>
                <Text bold={active} color={active ? 'white' : 'gray'}>
                  {f.required ? '* ' : '  '}{f.label}:
                </Text>
              </Box>
              <Box>
                <Text inverse={active}>
                  {val || (active ? '█' : '')}
                  {active && val ? '█' : ''}
                  {!val && !active ? <Text dimColor>—</Text> : null}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Status */}
      {status === 'sending' && <Text color="yellow">Отправка...</Text>}
      {status === 'done' && <Text color="green">✓ Дело добавлено</Text>}
      {status === 'error' && <Text color="red">✗ {errorMsg}</Text>}

      <Box marginTop={1}>
        <Text dimColor>
          {status === 'editing' ? '[Tab/стрелки] поле  [Enter] отправить  [Esc] отмена' : '[Esc] назад'}
        </Text>
      </Box>
    </Box>
  );
}

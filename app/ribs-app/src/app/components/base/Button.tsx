import styled from 'styled-components';

export const RequestButton = styled.button({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'fit-content',
  minWidth: '120px',
  maxWidth: '480px',
  height: '26px',
  padding: '3px 12px',
  borderRadius: '12px', 
  background: '#4f53c9', 
  color: '#fff',
  cursor: 'pointer',
  '&:disabled': { background: 'lightgray' },
});
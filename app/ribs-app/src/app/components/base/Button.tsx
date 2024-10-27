import styled from 'styled-components';

export const RequestButton = styled.button({
  width: 'fit-content',
  maxWidth: '480px',
  height: '30px',
  padding: '6px 31px',
  borderRadius: '50px', 
  background: '#000', 
  color: '#fff',
  cursor: 'pointer',
  '&:disabled': { background: 'lightgray' },
});
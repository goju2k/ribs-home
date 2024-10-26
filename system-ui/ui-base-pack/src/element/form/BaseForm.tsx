import { useEffect, useState } from 'react';

import { FormContext } from '../../context/FormContext';
import { BaseElementProp } from '../../type/base-prop';
import './BaseForm.css';

export interface BaseFormProps<T> extends BaseElementProp<React.FormHTMLAttributes<HTMLFormElement>, HTMLFormElement> {
  data:T;
  setData?:(data:T)=>void;
  onFormSubmit?:(data:T)=>void;
}

export function BaseForm<T>({ data, setData, onFormSubmit, children, ...props }:BaseFormProps<T>) {

  const [ formContextState, setFormContextState ] = useState({ data, setData });
  useEffect(() => {
    setFormContextState({ data, setData });
  }, [ data, setData ]);

  return (
    <FormContext.Provider value={formContextState}>
      <form
        className='base-form'
        {...props} 
        onSubmit={(e) => {
          if (onFormSubmit) {
            onFormSubmit(formContextState.data);
            e.preventDefault();
            console.log('onFormSubmit data', formContextState.data);
          }
        }}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}
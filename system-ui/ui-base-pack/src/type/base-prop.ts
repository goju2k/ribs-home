import React from 'react';

interface BaseFormBindingProp<T> {
  targetId:keyof T;
}

export type BaseElementProp<E extends React.HTMLAttributes<T>, T> = React.DetailedHTMLProps<E, T>;
export type BaseElementPropWithoutChildren<E extends React.HTMLAttributes<T>, T> = Omit<BaseElementProp<E, T>, 'children'>
export type BaseFormElementProp<E extends React.HTMLAttributes<T>, T, D> = Omit<BaseElementProp<E, T>, 'children'> & BaseFormBindingProp<D>;
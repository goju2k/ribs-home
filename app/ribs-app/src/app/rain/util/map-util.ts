import { MintMapController, NaverMintMapController, Position } from '@mint-ui/map';

export const getOffset = (controller:MintMapController, position:Position) => {
  if (controller instanceof NaverMintMapController) {
    return controller.naverPositionToOffset(position);
  }
  return controller.positionToOffset(position);
};
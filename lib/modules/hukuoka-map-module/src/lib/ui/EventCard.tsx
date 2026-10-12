import styled from 'styled-components';

import { formatClock, tripTimeToParts } from '../data/time';
import { describeActivity, findPlanEvents, TravelerState } from '../timeline/position';

export function EventCard({ t, state }:{ t: number; state: TravelerState; }) {
  const { current, next } = findPlanEvents(t);
  const dayOf = (et:number) => tripTimeToParts(et).day;
  return (
    <Card>
      <Title>
        {current ? (
          <>
            <When>{dayOf(current.t)}일 {formatClock(current.t)}</When>
            {current.title}
          </>
        ) : '여행 출발 전'}
      </Title>
      <Activity>{describeActivity(state)}</Activity>
      {next && <Next>다음 · {dayOf(next.t) !== tripTimeToParts(t).day ? `${dayOf(next.t)}일 ` : ''}{formatClock(next.t)} {next.title}</Next>}
    </Card>
  );
}

const Card = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  minHeight: '51px',
});

const Title = styled.div({
  fontFamily: 'Galmuri14, sans-serif',
  fontSize: '14px',
  lineHeight: '18px',
  color: '#ffffff',
});

const When = styled.span({
  color: '#ffd84a',
  marginRight: '6px',
});

const Activity = styled.div({ color: '#9fe3a6' });

const Next = styled.div({
  color: '#a9b0d6',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
import { TestBed } from '@angular/core/testing';

import { Ministra } from './ministra';

describe('Ministra', () => {
  let service: Ministra;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Ministra);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

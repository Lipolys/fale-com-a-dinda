import { TestBed } from '@angular/core/testing';

import { MinistraService } from './ministra';

describe('Ministra', () => {
  let service: MinistraService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MinistraService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
